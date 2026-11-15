-- Idempotent submissions: a double tap, two identical requests at once, or a
-- retry after a lost response can't place a wager twice or create two series.
--
-- The app sends a submission id (a UUID it generates per intended action) with
-- each wager and each new series. The first request with that id does the work
-- and records a receipt in the same transaction; any later request with the
-- same id returns that receipt instead of doing it again.
--
-- Why it holds under concurrency and across server instances: the receipt's
-- primary key is (user, submission id). Two transactions inserting the same key
-- can't both succeed: Postgres makes the second wait for the first and then
-- treats it as a conflict (or lets it proceed if the first rolled back). The
-- receipt and the wager commit or roll back together, so a failed attempt
-- leaves no receipt and a retry runs it properly.
--
-- Reusing an id for a different request (another amount, outcome, bet, or
-- series) is refused with request_id_reused, and nothing changes.
--
-- Additive only: one new table and two new functions. place_series_wager and
-- create_bet_series are unchanged, so settlement, payouts and older callers
-- behave exactly as before.

create table if not exists public.submission_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('place_wager', 'create_series')),
  -- md5 of the request's parameters, to tell a genuine retry from a reused id.
  fingerprint text not null,
  -- What the first request answered; returned to every retry.
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.submission_receipts enable row level security;
revoke all on table public.submission_receipts from anon, authenticated;

/**
 * Claim a submission id for this caller. True: it's new, go ahead (the claim
 * commits or rolls back with the caller's transaction). False: it was already
 * used for this exact request, and `r` holds its receipt.
 */
create or replace function public._idem_claim(p_request_id uuid, p_action text, p_fingerprint text, out claimed boolean, out r public.submission_receipts)
language plpgsql set search_path=public as $$
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  if p_request_id is null then perform public._bs_fail('invalid_request', 'Missing submission id.'); end if;
  insert into public.submission_receipts(user_id, request_id, action, fingerprint)
  values (auth.uid(), p_request_id, p_action, p_fingerprint)
  on conflict (user_id, request_id) do nothing;
  claimed := found;
  if claimed then return; end if;
  select * into r from public.submission_receipts where user_id = auth.uid() and request_id = p_request_id;
  if r.action <> p_action or r.fingerprint <> p_fingerprint then
    perform public._bs_fail('request_id_reused', 'This submission was already used for a different request. Nothing was changed.');
  end if;
end $$;

/**
 * Place a wager once per submission id. Same rules as place_series_wager (it
 * does the work); answers a receipt: what this submission added, your total on
 * that outcome afterwards, and your free coins afterwards.
 */
create or replace function public.place_series_wager_once(
  p_request_id uuid, p_series_id uuid, p_bet_id uuid, p_outcome text, p_amount bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare c record; w public.series_wagers; v_total bigint; v_free bigint; v_result jsonb;
begin
  select * into c from public._idem_claim(p_request_id, 'place_wager', md5(jsonb_build_object(
    'series', p_series_id, 'bet', p_bet_id, 'outcome', lower(trim(coalesce(p_outcome, ''))), 'amount', p_amount)::text));
  if not c.claimed then return (c.r).result || jsonb_build_object('replayed', true); end if;

  select * into w from public.place_series_wager(p_series_id, p_bet_id, p_outcome, p_amount);
  -- place_series_wager holds the series and participant locks until commit, so these are exact.
  select coalesce(sum(amount), 0) into v_total from public.series_wagers where bet_id = w.bet_id and user_id = auth.uid() and outcome_id = w.outcome_id;
  select balance into v_free from public.bet_series_participants where series_id = p_series_id and user_id = auth.uid();
  v_result := jsonb_build_object(
    'requestId', p_request_id, 'wagerId', w.id, 'seriesId', p_series_id, 'betId', w.bet_id,
    'outcomeId', w.outcome_id, 'outcome', w.outcome, 'amount', w.amount,
    'previousStake', v_total - w.amount, 'totalStake', v_total, 'addedToExisting', v_total > w.amount,
    'available', v_free, 'placedAt', public._bs_iso(w.created_at));
  update public.submission_receipts set result = v_result where user_id = auth.uid() and request_id = p_request_id;
  return v_result || jsonb_build_object('replayed', false);
end $$;

/** Create a series once per submission id. Same rules and arguments as create_bet_series; answers the series row as JSON. */
create or replace function public.create_bet_series_once(
  p_request_id uuid, p_title text, p_description text, p_planned_bet_count integer, p_initial_bankroll bigint,
  p_loser_count integer, p_stake_mode text, p_questions text[] default '{}', p_settings jsonb default '{}', p_bets jsonb default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare c record; s public.bet_series; v_result jsonb;
begin
  select * into c from public._idem_claim(p_request_id, 'create_series', md5(jsonb_build_object(
    'title', p_title, 'description', p_description, 'bets_planned', p_planned_bet_count, 'bankroll', p_initial_bankroll,
    'losers', p_loser_count, 'mode', p_stake_mode, 'questions', to_jsonb(coalesce(p_questions, '{}')),
    'settings', coalesce(p_settings, '{}'), 'bets', p_bets)::text));
  if not c.claimed then return (c.r).result || jsonb_build_object('replayed', true); end if;

  select * into s from public.create_bet_series(p_title, p_description, p_planned_bet_count, p_initial_bankroll,
    p_loser_count, p_stake_mode, coalesce(p_questions, '{}'), coalesce(p_settings, '{}'), p_bets);
  v_result := to_jsonb(s);
  update public.submission_receipts set result = v_result where user_id = auth.uid() and request_id = p_request_id;
  return v_result || jsonb_build_object('replayed', false);
end $$;

revoke all on function public._idem_claim(uuid, text, text) from public, anon, authenticated;
revoke all on function
  public.place_series_wager_once(uuid, uuid, uuid, text, bigint),
  public.create_bet_series_once(uuid, text, text, integer, bigint, integer, text, text[], jsonb, jsonb)
from public, anon;
grant execute on function
  public.place_series_wager_once(uuid, uuid, uuid, text, bigint),
  public.create_bet_series_once(uuid, text, text, integer, bigint, integer, text, text[], jsonb, jsonb)
to authenticated;
