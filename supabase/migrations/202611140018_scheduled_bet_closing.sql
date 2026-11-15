-- Scheduled bet closing: a bet can have a deadline (closes_at), after which no
-- wager is accepted, with no host action needed.
--
-- How the deadline is enforced (no background job is required for correctness):
--   * Every wager, withdrawal, manual close and settlement first takes the
--     series row lock, then closes any of that series' bets whose deadline has
--     passed (by the database clock, clock_timestamp()), then runs the usual
--     rules. A wager after the deadline therefore always finds the bet closed,
--     however late any job runs, and closing and wagering can't interleave.
--   * Reads show a bet as closed from its deadline on, computed from the
--     database clock, even before anything has written the change.
--   * The API also closes due bets in a caller's series on each state read, and
--     if the pg_cron extension is enabled, a job does it every minute for all
--     series. Both only make the closed state permanent sooner (and refund
--     one-sided pools, as a manual close does); closing is idempotent.
--
-- The existing functions are kept: each is renamed to an internal "_core" and
-- wrapped by a function with the same name and arguments (plus an optional
-- deadline where a bet is created). Settlement and payout logic is unchanged.
-- Additive only: one new nullable column; existing bets have no deadline.

alter table public.series_bets add column if not exists closes_at timestamptz;
create index if not exists series_bets_due_idx on public.series_bets(closes_at) where status = 'OPEN' and closes_at is not null;

-- ---------- closing due bets ----------

/**
 * Close this series' bets whose deadline has passed: the same as a manual close
 * (one-sided pools are refunded), timed at the deadline. The caller must hold the
 * series row lock. Safe to call any number of times.
 */
create or replace function public._bs_close_due(p_series_id uuid, p_bet_id uuid default null) returns int
language plpgsql set search_path=public as $$
declare b public.series_bets; v_sides int; v_n int := 0;
begin
  for b in
    select * from public.series_bets
    where series_id = p_series_id and status = 'OPEN' and closes_at is not null and closes_at <= clock_timestamp()
      and (p_bet_id is null or id = p_bet_id)
    order by position for update
  loop
    update public.series_bets set status = 'LOCKED', closed_at = b.closes_at where id = b.id;
    perform public._bs_log(p_series_id, 'Betting closed at the deadline: ' || b.question);
    select count(distinct outcome_id) into v_sides from public.series_wagers where bet_id = b.id;
    if v_sides = 1 then perform public._bs_settle(p_series_id, b.id, null, false); end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

/** Lock a series and close its due bets. Returns how many closed. */
create or replace function public._bs_lock_and_close_due(p_series_id uuid) returns int
language plpgsql set search_path=public as $$
begin
  perform 1 from public.bet_series where id = p_series_id and status = 'ACTIVE' for update;
  if not found then return 0; end if;
  return public._bs_close_due(p_series_id);
end $$;

/** Close due bets in every series the caller is in (the API calls this before reading state). */
create or replace function public.close_due_bets() returns int
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_n int := 0;
begin
  if auth.uid() is null then return 0; end if;
  for v_id in
    select distinct b.series_id from public.series_bets b
    join public.bet_series_participants p on p.series_id = b.series_id and p.user_id = auth.uid()
    where b.status = 'OPEN' and b.closes_at <= clock_timestamp()
  loop
    v_n := v_n + public._bs_lock_and_close_due(v_id);
  end loop;
  return v_n;
end $$;

/** Close due bets everywhere. For a scheduled job (pg_cron); not callable through the API. */
create or replace function public._bs_close_all_due() returns int
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_n int := 0;
begin
  for v_id in select distinct series_id from public.series_bets where status = 'OPEN' and closes_at <= clock_timestamp() loop
    v_n := v_n + public._bs_lock_and_close_due(v_id);
  end loop;
  return v_n;
end $$;

/** A deadline the host asked for: must be in the future and within a year. */
create or replace function public._bs_check_deadline(p_closes_at timestamptz) returns void
language plpgsql set search_path=public as $$
begin
  if p_closes_at is null then return; end if;
  if p_closes_at <= clock_timestamp() then perform public._bs_fail('invalid_deadline', 'Pick a closing time in the future.'); end if;
  if p_closes_at > clock_timestamp() + interval '366 days' then perform public._bs_fail('invalid_deadline', 'Pick a closing time within a year.'); end if;
end $$;

/** A deadline from a bet in a create request: { closesAt: ISO string | null }. */
create or replace function public._bs_deadline_of(p_item jsonb) returns timestamptz
language plpgsql set search_path=public as $$
declare v text := case when jsonb_typeof(p_item) = 'object' then p_item->>'closesAt' end;
begin
  if v is null or trim(v) = '' then return null; end if;
  -- Needs an explicit offset (Z or ±hh:mm), so the time can't depend on the database's timezone.
  if v !~ '(Z|[+-]\d\d:?\d\d)$' then perform public._bs_fail('invalid_deadline', 'Closing times need a timezone.'); end if;
  return v::timestamptz;
exception when others then
  if sqlstate = 'P0001' then raise; end if;
  perform public._bs_fail('invalid_deadline', 'That closing time isn''t a valid date and time.');
  return null;
end $$;

-- ---------- wrap the existing functions ----------

alter function public.place_series_wager(uuid, uuid, text, bigint) rename to _bs_place_series_wager_core;
alter function public.withdraw_series_wager(uuid, uuid) rename to _bs_withdraw_series_wager_core;
alter function public.lock_series_bet(uuid, uuid) rename to _bs_lock_series_bet_core;
alter function public.finish_series_bet(uuid, uuid, text, boolean, text[], numeric) rename to _bs_finish_series_bet_core;
alter function public.create_series_bet(uuid, text, text[], text, text, jsonb, text, int) rename to _bs_create_series_bet_core;
alter function public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb, jsonb) rename to _bs_create_bet_series_core;
alter function public.start_bet_series(uuid) rename to _bs_start_bet_series_core;
alter function public._bs_series_json(uuid) rename to _bs_series_json_core;

/** Same as before, but a bet whose deadline has passed is closed first, so a late wager is refused. */
create function public.place_series_wager(p_series_id uuid, p_bet_id uuid, p_outcome text, p_amount bigint) returns public.series_wagers
language plpgsql security definer set search_path=public as $$
declare w public.series_wagers; b public.series_bets;
begin
  perform 1 from public.bet_series where id = p_series_id for update;
  if public._bs_close_due(p_series_id, p_bet_id) > 0 then
    select * into b from public.series_bets where id = p_bet_id;
    perform public._bs_fail('bet_not_open', 'Betting closed at ' || public._bs_iso(b.closes_at) || '.');
  end if;
  select * into w from public._bs_place_series_wager_core(p_series_id, p_bet_id, p_outcome, p_amount);
  return w;
end $$;

create function public.withdraw_series_wager(p_series_id uuid, p_bet_id uuid) returns bigint
language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.bet_series where id = p_series_id for update;
  perform public._bs_close_due(p_series_id, p_bet_id);
  return public._bs_withdraw_series_wager_core(p_series_id, p_bet_id);
end $$;

create function public.lock_series_bet(p_series_id uuid, p_bet_id uuid) returns public.series_bets
language plpgsql security definer set search_path=public as $$
declare b public.series_bets;
begin
  perform 1 from public.bet_series where id = p_series_id for update;
  perform public._bs_close_due(p_series_id, p_bet_id);
  select * into b from public._bs_lock_series_bet_core(p_series_id, p_bet_id);
  return b;
end $$;

create function public.finish_series_bet(
  p_series_id uuid, p_bet_id uuid, p_outcome text, p_cancel boolean default false, p_tied text[] default null, p_value numeric default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.bet_series where id = p_series_id for update;
  perform public._bs_close_due(p_series_id, p_bet_id);
  return public._bs_finish_series_bet_core(p_series_id, p_bet_id, p_outcome, p_cancel, p_tied, p_value);
end $$;

/** Same as before, plus an optional deadline. */
create function public.create_series_bet(
  p_series_id uuid, p_question text, p_outcomes text[] default null, p_tie_rule text default null,
  p_kind text default null, p_ranges jsonb default null, p_unit text default null, p_decimals int default null,
  p_closes_at timestamptz default null
) returns public.series_bets language plpgsql security definer set search_path=public as $$
declare b public.series_bets;
begin
  perform public._bs_check_deadline(p_closes_at);
  select * into b from public._bs_create_series_bet_core(p_series_id, p_question, p_outcomes, p_tie_rule, p_kind, p_ranges, p_unit, p_decimals);
  if p_closes_at is not null then
    update public.series_bets set closes_at = p_closes_at where id = b.id returning * into b;
  end if;
  return b;
end $$;

/** Same as before; each bet in p_bets may carry { closesAt }. */
create function public.create_bet_series(
  p_title text, p_description text, p_planned_bet_count integer, p_initial_bankroll bigint,
  p_loser_count integer, p_stake_mode text, p_questions text[] default '{}', p_settings jsonb default '{}', p_bets jsonb default null
) returns public.bet_series language plpgsql security definer set search_path=public as $$
declare s public.bet_series; v_deadlines timestamptz[] := '{}'; i int;
begin
  if p_bets is not null and jsonb_typeof(p_bets) = 'array' then
    for i in 0 .. jsonb_array_length(p_bets) - 1 loop
      v_deadlines := v_deadlines || public._bs_deadline_of(p_bets->i);
      perform public._bs_check_deadline(v_deadlines[i + 1]);
    end loop;
  end if;
  select * into s from public._bs_create_bet_series_core(p_title, p_description, p_planned_bet_count, p_initial_bankroll,
    p_loser_count, p_stake_mode, p_questions, p_settings, p_bets);
  -- Bets are created in the order given, so the n-th bet by position is the n-th item.
  update public.series_bets b set closes_at = v_deadlines[x.n]
  from (select id, row_number() over (order by position) as n from public.series_bets where series_id = s.id) x
  where b.id = x.id and v_deadlines[x.n] is not null;
  return s;
end $$;

/** Same as before, but betting can't start if a bet's deadline has already passed. */
create function public.start_bet_series(p_series_id uuid) returns public.bet_series
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; v_q text;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if found and s.status = 'LOBBY' and s.host_user_id = auth.uid() then
    select question into v_q from public.series_bets
    where series_id = s.id and status = 'PLANNED' and closes_at is not null and closes_at <= clock_timestamp() + interval '1 minute'
    order by position limit 1;
    if v_q is not null then
      perform public._bs_fail('invalid_deadline', format('"%s" closes before betting would start. Change or clear its closing time first.', v_q));
    end if;
  end if;
  select * into s from public._bs_start_bet_series_core(p_series_id);
  return s;
end $$;

/** Host sets, moves or clears a bet's deadline (null clears it) while the bet is a draft or still open. */
create or replace function public.set_series_bet_deadline(p_series_id uuid, p_bet_id uuid, p_closes_at timestamptz) returns public.series_bets
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  perform public._bs_close_due(s.id, p_bet_id);
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status not in ('PLANNED', 'OPEN') then perform public._bs_fail('bet_not_open', 'Betting has already closed on this one.'); end if;
  perform public._bs_check_deadline(p_closes_at);
  update public.series_bets set closes_at = p_closes_at where id = b.id returning * into b;
  if b.status = 'OPEN' then
    perform public._bs_log(s.id, case when p_closes_at is null then 'Closing time removed: ' else 'Closing time set for ' end || b.question);
  end if;
  return b;
end $$;

/**
 * A series as the app shows it (see the core), plus each bet's deadline. A bet
 * past its deadline reads as closed even if nothing has closed it yet.
 */
create function public._bs_series_json(p_series_id uuid) returns jsonb language sql stable set search_path=public as $$
  select case when j is null then null else jsonb_set(j, '{bets}', coalesce((
    select jsonb_agg(e || jsonb_build_object(
        'closesAt', public._bs_iso(b.closes_at),
        'status', case when e->>'status' = 'open' and b.closes_at <= now() then 'closed' else e->>'status' end,
        'closedAt', case when e->>'status' = 'open' and b.closes_at <= now() then to_jsonb(public._bs_iso(b.closes_at)) else e->'closedAt' end
      ) order by x.ord)
    from jsonb_array_elements(j->'bets') with ordinality as x(e, ord)
    left join public.series_bets b on b.id = (e->>'id')::uuid
  ), '[]'::jsonb)) end
  from (select public._bs_series_json_core(p_series_id) as j) t
$$;

-- ---------- optional: close due bets every minute when pg_cron is enabled ----------

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'alea-close-due-bets';
    perform cron.schedule('alea-close-due-bets', '* * * * *', 'select public._bs_close_all_due()');
  end if;
end $$;

-- ---------- permissions ----------

revoke all on function
  public._bs_place_series_wager_core(uuid, uuid, text, bigint), public._bs_withdraw_series_wager_core(uuid, uuid),
  public._bs_lock_series_bet_core(uuid, uuid), public._bs_finish_series_bet_core(uuid, uuid, text, boolean, text[], numeric),
  public._bs_create_series_bet_core(uuid, text, text[], text, text, jsonb, text, int),
  public._bs_create_bet_series_core(text, text, integer, bigint, integer, text, text[], jsonb, jsonb),
  public._bs_start_bet_series_core(uuid), public._bs_series_json_core(uuid), public._bs_series_json(uuid),
  public._bs_close_due(uuid, uuid), public._bs_lock_and_close_due(uuid), public._bs_close_all_due(),
  public._bs_check_deadline(timestamptz), public._bs_deadline_of(jsonb)
from public, anon, authenticated;

revoke all on function
  public.place_series_wager(uuid, uuid, text, bigint), public.withdraw_series_wager(uuid, uuid),
  public.lock_series_bet(uuid, uuid), public.finish_series_bet(uuid, uuid, text, boolean, text[], numeric),
  public.create_series_bet(uuid, text, text[], text, text, jsonb, text, int, timestamptz),
  public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb, jsonb),
  public.start_bet_series(uuid), public.set_series_bet_deadline(uuid, uuid, timestamptz), public.close_due_bets()
from public, anon;

grant execute on function
  public.place_series_wager(uuid, uuid, text, bigint), public.withdraw_series_wager(uuid, uuid),
  public.lock_series_bet(uuid, uuid), public.finish_series_bet(uuid, uuid, text, boolean, text[], numeric),
  public.create_series_bet(uuid, text, text[], text, text, jsonb, text, int, timestamptz),
  public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb, jsonb),
  public.start_bet_series(uuid), public.set_series_bet_deadline(uuid, uuid, timestamptz), public.close_due_bets()
to authenticated;
