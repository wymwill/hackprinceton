-- Opt-in reminders, delivered in the app (Your moves).
--
-- Three kinds, each off until the player turns it on:
--   closing_bet       a bet you haven't wagered on closes within 24 hours;
--   unresolved_result you host a bet that's closed and still needs its result;
--   punishment_pick   it's your turn to pick a punishment for someone.
--
-- Reminders are worked out from the real state each time the app asks
-- (my_notifications), so no scheduler is needed and nothing is sent to anyone
-- who didn't opt in. Each action gets at most one reminder per person
-- (unique per user, kind and bet/assignment); it's marked resolved as soon as
-- the action is done, no longer needed, or the kind is turned off, and only
-- comes back if the action is needed again (say, after a withdrawal).
-- No email or push is sent: there's no mail provider in this project yet.

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  closing_bets boolean not null default false,
  unresolved_results boolean not null default false,
  punishment_picks boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('closing_bet', 'unresolved_result', 'punishment_pick')),
  -- The bet or punishment assignment it's about.
  ref_id uuid not null,
  series_id uuid not null references public.bet_series(id) on delete cascade,
  title text not null,
  body text not null default '',
  link text not null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  unique (user_id, kind, ref_id)
);
create index if not exists notifications_active on public.notifications(user_id) where resolved_at is null;

alter table public.notification_prefs enable row level security;
alter table public.notifications enable row level security;
revoke all on table public.notification_prefs, public.notifications from anon, authenticated;

/** What the player needs to do right now, by kind (whether or not they asked to be reminded). */
create or replace function public._rem_candidates(p_user uuid)
returns table(kind text, ref_id uuid, series_id uuid, title text, body text, link text, due_at timestamptz)
language sql stable set search_path=public as $$
  -- Bets you can still bet on that close within a day.
  select 'closing_bet', b.id, s.id, 'Place a bet before it closes', b.question, '/s/' || s.id || '/bets/' || b.id, b.closes_at
  from public.series_bets b
  join public.bet_series s on s.id = b.series_id
  join public.bet_series_participants p on p.series_id = s.id and p.user_id = p_user and p.plays
  where s.status = 'ACTIVE' and b.status = 'OPEN' and b.closes_at > now() and b.closes_at <= now() + interval '24 hours'
    and not exists (select 1 from public.series_wagers w where w.bet_id = b.id and w.user_id = p_user)
  union all
  -- Bets you host that are closed (by you or by their deadline) and need a result.
  select 'unresolved_result', b.id, s.id, 'Call the result', b.question, '/s/' || s.id || '/bets/' || b.id, coalesce(b.closed_at, b.closes_at)
  from public.series_bets b
  join public.bet_series s on s.id = b.series_id
  where s.host_user_id = p_user and s.status = 'ACTIVE'
    and (b.status = 'LOCKED' or (b.status = 'OPEN' and b.closes_at <= now()))
  union all
  -- Punishments it's your turn to pick (in an exclusive pool, earlier picks go first).
  select 'punishment_pick', a.id, s.id, 'Pick a punishment for ' || public._bs_name(s.id, a.loser_id), '', '/s/' || s.id, null::timestamptz
  from public.series_favor_assignments a
  join public.bet_series s on s.id = a.series_id
  where a.winner_id = p_user and a.status in ('PICKING', 'DECLINED') and s.stake_mode = 'SHARED_FAVOR_POOL'
    and public.is_bet_series_member(s.id, p_user)
    and (not s.exclusive_pool or a.status = 'DECLINED' or not exists (
      select 1 from public.series_favor_assignments e where e.series_id = a.series_id and e.position < a.position and e.status = 'PICKING'))
$$;

create or replace function public._rem_prefs_json(p public.notification_prefs) returns jsonb language sql immutable as $$
  select jsonb_build_object('closingBets', coalesce(p.closing_bets, false), 'unresolvedResults', coalesce(p.unresolved_results, false),
    'punishmentPicks', coalesce(p.punishment_picks, false))
$$;

/**
 * Your reminders: brings them up to date (new ones for what you opted into,
 * resolved ones for what's done), then answers { prefs, notifications, unread }.
 */
create or replace function public.my_notifications() returns jsonb
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); p public.notification_prefs;
begin
  if me is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  select * into p from public.notification_prefs where user_id = me;

  -- Done, no longer needed, or turned off: resolved (and gone from the list).
  update public.notifications n set resolved_at = now()
  where n.user_id = me and n.resolved_at is null and (
    case n.kind when 'closing_bet' then not coalesce(p.closing_bets, false)
                when 'unresolved_result' then not coalesce(p.unresolved_results, false)
                else not coalesce(p.punishment_picks, false) end
    or not exists (select 1 from public._rem_candidates(me) c where c.kind = n.kind and c.ref_id = n.ref_id));

  -- New ones for what you asked to be reminded about. One per action; a resolved one comes back only if needed again.
  insert into public.notifications(user_id, kind, ref_id, series_id, title, body, link, due_at)
  select me, c.kind, c.ref_id, c.series_id, c.title, c.body, c.link, c.due_at
  from public._rem_candidates(me) c
  where case c.kind when 'closing_bet' then coalesce(p.closing_bets, false)
                    when 'unresolved_result' then coalesce(p.unresolved_results, false)
                    else coalesce(p.punishment_picks, false) end
  on conflict (user_id, kind, ref_id) do update
    set resolved_at = null, read_at = null, created_at = now(), title = excluded.title, body = excluded.body, due_at = excluded.due_at
    where public.notifications.resolved_at is not null;

  return jsonb_build_object(
    'prefs', public._rem_prefs_json(p),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'kind', n.kind, 'refId', n.ref_id, 'seriesId', n.series_id, 'title', n.title, 'body', n.body,
        'link', n.link, 'dueAt', public._bs_iso(n.due_at), 'createdAt', public._bs_iso(n.created_at), 'read', n.read_at is not null
      ) order by n.due_at nulls last, n.created_at)
      from public.notifications n where n.user_id = me and n.resolved_at is null), '[]'::jsonb),
    'unread', (select count(*) from public.notifications where user_id = me and resolved_at is null and read_at is null)
  );
end $$;

/** Turn reminder kinds on or off (null leaves one as it is). Answers the same as my_notifications. */
create or replace function public.set_notification_prefs(
  p_closing_bets boolean default null, p_unresolved_results boolean default null, p_punishment_picks boolean default null
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  insert into public.notification_prefs(user_id, closing_bets, unresolved_results, punishment_picks)
  values (auth.uid(), coalesce(p_closing_bets, false), coalesce(p_unresolved_results, false), coalesce(p_punishment_picks, false))
  on conflict (user_id) do update set
    closing_bets = coalesce(p_closing_bets, public.notification_prefs.closing_bets),
    unresolved_results = coalesce(p_unresolved_results, public.notification_prefs.unresolved_results),
    punishment_picks = coalesce(p_punishment_picks, public.notification_prefs.punishment_picks),
    updated_at = now();
  return public.my_notifications();
end $$;

/** Mark your reminders seen: these ids, or all of them when p_ids is null. */
create or replace function public.mark_notifications_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path=public as $$
declare v_n int;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and resolved_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public._rem_candidates(uuid), public._rem_prefs_json(public.notification_prefs) from public, anon, authenticated;
revoke all on function public.my_notifications(), public.set_notification_prefs(boolean, boolean, boolean), public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.my_notifications(), public.set_notification_prefs(boolean, boolean, boolean), public.mark_notifications_read(bigint[]) to authenticated;
