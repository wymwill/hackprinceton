-- Bet close times: the host can give any bet a "betting closes at" time.
--
-- Once it passes, the bet behaves as closed even if the host never taps Lock:
--   * new wagers are refused (a trigger on series_wagers, so every path that adds a wager is covered);
--   * withdrawals are refused (withdraw_series_wager, redefined below);
--   * the series JSON reports the bet as "closed", with closedAt = the close time.
-- The host still resolves it as before. Nothing runs on a timer: the rules are checked
-- whenever someone reads or writes, so this works without pg_cron.
--
-- _bs_series_json is wrapped, not rewritten: the version from 0010 is renamed to
-- _bs_series_json_base and the new _bs_series_json adds closesAt to each bet. A later
-- migration that redefines the series JSON should redefine _bs_series_json_base instead.

alter table public.series_bets add column if not exists closes_at timestamptz;

-- ---------- wagers stop at the close time ----------

create or replace function public._bs_wager_deadline() returns trigger
language plpgsql set search_path=public as $$
declare v_closes timestamptz;
begin
  select closes_at into v_closes from public.series_bets where id = new.bet_id;
  if v_closes is not null and now() >= v_closes then
    perform public._bs_fail('bet_not_open', 'Betting closed at its closing time.');
  end if;
  return new;
end $$;

drop trigger if exists series_wagers_deadline on public.series_wagers;
create trigger series_wagers_deadline before insert on public.series_wagers
  for each row execute function public._bs_wager_deadline();

/** Take your whole wager back, inside the window after the bet opened and before its close time. Returns the coins refunded. */
create or replace function public.withdraw_series_wager(p_series_id uuid, p_bet_id uuid) returns bigint
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; v_total bigint;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if not public.is_bet_series_member(s.id, auth.uid()) then perform public._bs_fail('not_member', 'You''re not in this series.'); end if;
  if s.status <> 'ACTIVE' then
    perform public._bs_fail('series_not_active', case when s.status = 'LOBBY' then 'Betting hasn''t started yet.' else 'This series is over.' end);
  end if;
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status <> 'OPEN' or (b.closes_at is not null and now() >= b.closes_at) then
    perform public._bs_fail('bet_not_open', case when b.status in ('OPEN','LOCKED') then 'Betting is closed on this one.' else 'This bet is finished.' end);
  end if;
  select sum(amount) into v_total from public.series_wagers where bet_id = b.id and user_id = auth.uid();
  if v_total is null then perform public._bs_fail('no_wager', 'You don''t have a wager on this bet.'); end if;
  if s.withdraw_minutes <= 0 then perform public._bs_fail('withdraw_closed', 'This series doesn''t allow withdrawals.'); end if;
  if now() >= b.opened_at + make_interval(mins => s.withdraw_minutes) then perform public._bs_fail('withdraw_closed', 'The withdrawal window has passed.'); end if;
  delete from public.series_wagers where bet_id = b.id and user_id = auth.uid();
  update public.bet_series_participants set balance = balance + v_total where series_id = s.id and user_id = auth.uid();
  perform public._bs_log(s.id, public._bs_name(s.id, auth.uid()) || ' withdrew from: ' || b.question);
  return v_total;
end $$;

-- ---------- the host sets or clears a close time ----------

/**
 * Host only. Works on a draft bet (in the lobby or later) or an open one whose close time
 * hasn't passed. p_closes_at must be in the future and within a year; null removes it.
 */
create or replace function public.set_series_bet_close(p_series_id uuid, p_bet_id uuid, p_closes_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  if s.status = 'COMPLETED' then perform public._bs_fail('series_over', 'This series is over.'); end if;
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status not in ('PLANNED','OPEN') or (b.closes_at is not null and now() >= b.closes_at) then
    perform public._bs_fail('bet_not_open', 'Betting on this bet has already closed.');
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    perform public._bs_fail('invalid_close_time', 'Pick a closing time in the future.');
  end if;
  if p_closes_at is not null and p_closes_at > now() + interval '366 days' then
    perform public._bs_fail('invalid_close_time', 'Pick a closing time within a year.');
  end if;
  update public.series_bets set closes_at = p_closes_at where id = b.id;
  if b.status = 'OPEN' and p_closes_at is distinct from b.closes_at then
    perform public._bs_log(s.id, case when p_closes_at is null then 'No closing time any more: ' else 'Closing time set: ' end || b.question);
  end if;
  return jsonb_build_object('betId', b.id, 'closesAt', public._bs_iso(p_closes_at));
end $$;

-- ---------- the series JSON shows it ----------

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = '_bs_series_json_base') then
    alter function public._bs_series_json(uuid) rename to _bs_series_json_base;
  end if;
end $$;

/** The series as the app sees it, with each bet's closesAt; an open bet past its close time reads as closed. */
create or replace function public._bs_series_json(p_series_id uuid) returns jsonb
language sql stable set search_path=public as $$
  select case when t.j is null then null else jsonb_set(t.j, '{bets}', coalesce((
    select jsonb_agg(
      x.e || jsonb_build_object('closesAt', public._bs_iso(b.closes_at))
        || case when x.e->>'status' = 'open' and b.closes_at is not null and b.closes_at <= now()
             then jsonb_build_object('status', 'closed', 'closedAt', public._bs_iso(b.closes_at))
             else '{}'::jsonb end
      order by x.ord)
    from jsonb_array_elements(t.j->'bets') with ordinality as x(e, ord)
    left join public.series_bets b on b.id = (x.e->>'id')::uuid
  ), '[]'::jsonb)) end
  from (select public._bs_series_json_base(p_series_id) as j) t
$$;

-- ---------- permissions ----------

revoke all on function public._bs_wager_deadline(), public._bs_series_json(uuid), public._bs_series_json_base(uuid)
from public, anon, authenticated;

revoke all on function
  public.set_series_bet_close(uuid, uuid, timestamptz),
  public.withdraw_series_wager(uuid, uuid)
from public, anon;

grant execute on function
  public.set_series_bet_close(uuid, uuid, timestamptz),
  public.withdraw_series_wager(uuid, uuid)
to authenticated;
