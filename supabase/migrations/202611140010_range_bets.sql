-- Bet Series: numerical range bets ("What will tomorrow's high be? Below 60°F, 60–64°F, …").
--
-- Built on 0009: each range is an ordinary outcome row with a stable id, so wagers,
-- pool shares, payouts, refunds and the settle-once lock are the same as for
-- multiple choice. A range bet adds:
--   * kind RANGE, a unit (°F, °C, points, $, …) and a precision (0 to 3 decimal places);
--   * per outcome a lower and upper bound. Every range is lower-inclusive and
--     upper-exclusive: lower ≤ x < upper. Null lower = "below …", null upper = "… or above";
--   * result_value: the number the host enters. The database picks the range.
-- Rules:
--   * 2 to 10 ranges, contiguous (each upper equals the next lower): no gaps, no overlaps.
--     Only the first may be open below and only the last open above.
--   * bounds and the entered result may not have more decimals than the bet's precision,
--     so no value can fall between two labeled ranges ("60–64" at 0 decimals = 60 ≤ x < 65).
--   * the host settles by entering the result; picking a range by hand, or reporting a tie,
--     is refused. A result outside closed ends refunds everyone.
--   * ranges, unit and precision lock when betting on the bet opens, like other outcomes.

-- ---------- schema ----------

alter table public.series_bets
  add column if not exists unit text,
  add column if not exists decimals integer,
  add column if not exists result_value numeric;
alter table public.series_bets drop constraint if exists series_bets_kind_check;
alter table public.series_bets add constraint series_bets_kind_check check (
  kind in ('BINARY','MULTI','RANGE') and tie_rule in ('REFUND','FIRST_LISTED')
  and (kind <> 'RANGE' or (decimals between 0 and 3 and unit is not null and char_length(unit) <= 12))
);

alter table public.series_bet_outcomes
  add column if not exists lower_bound numeric,
  add column if not exists upper_bound numeric;
alter table public.series_bet_outcomes drop constraint if exists series_bet_outcomes_bounds_check;
alter table public.series_bet_outcomes add constraint series_bet_outcomes_bounds_check check (
  lower_bound is null or upper_bound is null or lower_bound < upper_bound
);

-- ---------- helpers (internal) ----------

/** A number shown to `p_decimals` places: 70 → "70", 70 at 1 place → "70.0", -2.5 → "-2.5". */
create or replace function public._bs_num(p numeric, p_decimals int) returns text language sql immutable as $$
  select round(p, p_decimals)::text
$$;

/** A value with its unit: "$5", "72°F", "12 points". Currency symbols go in front. */
create or replace function public._bs_with_unit(p_value text, p_unit text) returns text language sql immutable as $$
  select case
    when coalesce(p_unit, '') = '' then p_value
    when p_unit in ('$','€','£','¥') then case when left(p_value, 1) = '-' then '-' || p_unit || substr(p_value, 2) else p_unit || p_value end
    when p_unit ~ '^[[:alpha:]]' then p_value || ' ' || p_unit
    else p_value || p_unit
  end
$$;

/**
 * The label for lower ≤ x < upper at `p_decimals` places. The shown top of a range is the
 * largest value it holds at that precision: [60, 65) at 0 places is "60–64".
 */
create or replace function public._bs_range_label(p_lower numeric, p_upper numeric, p_unit text, p_decimals int) returns text
language sql immutable as $$
  select case
    when p_lower is null then 'Below ' || public._bs_with_unit(public._bs_num(p_upper, p_decimals), p_unit)
    when p_upper is null then public._bs_with_unit(public._bs_num(p_lower, p_decimals), p_unit) || ' or above'
    when p_upper - power(10::numeric, -p_decimals) = p_lower then public._bs_with_unit(public._bs_num(p_lower, p_decimals), p_unit)
    -- "60–64", but "-10 to -6": a dash next to a minus sign is hard to read.
    -- Currency symbols go on both ends: "$4.50–$4.99".
    else case when p_unit in ('$','€','£','¥') then public._bs_with_unit(public._bs_num(p_lower, p_decimals), p_unit) else public._bs_num(p_lower, p_decimals) end
      || case when p_lower < 0 or p_upper - power(10::numeric, -p_decimals) < 0 then ' to ' else '–' end
      || public._bs_with_unit(public._bs_num(p_upper - power(10::numeric, -p_decimals), p_decimals), p_unit)
  end
$$;

/** A JSON value as a finite number with at most `p_decimals` places; null for JSON null. Fails otherwise. */
create or replace function public._bs_bound(p jsonb, p_what text, p_decimals int) returns numeric language plpgsql immutable as $$
declare v numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'number' then perform public._bs_fail('invalid_ranges', p_what || ' must be a number.'); end if;
  v := (p #>> '{}')::numeric;
  if abs(v) > 1000000000 then perform public._bs_fail('invalid_ranges', p_what || ' is too large.'); end if;
  if v <> round(v, p_decimals) then
    perform public._bs_fail('invalid_ranges', format('%s has more than %s decimal place%s.', p_what, p_decimals, case when p_decimals = 1 then '' else 's' end));
  end if;
  return v;
end $$;

/**
 * Check a list of ranges [{ lower, upper }] (null = open) and return it cleaned, in order.
 * 2 to 10 ranges, each lower < upper, contiguous, open ends only at the very ends.
 */
create or replace function public._bs_clean_ranges(p_ranges jsonb, p_decimals int) returns jsonb language plpgsql immutable as $$
declare n int; i int; lo numeric; hi numeric; prev_hi numeric; out jsonb := '[]';
begin
  if p_ranges is null or jsonb_typeof(p_ranges) <> 'array' then perform public._bs_fail('invalid_ranges', 'List the ranges.'); end if;
  n := jsonb_array_length(p_ranges);
  if n not between 2 and 10 then perform public._bs_fail('invalid_ranges', 'A range bet needs 2 to 10 ranges.'); end if;
  for i in 0..n - 1 loop
    if jsonb_typeof(p_ranges->i) <> 'object' then perform public._bs_fail('invalid_ranges', format('Range %s needs a lower and upper bound.', i + 1)); end if;
    lo := public._bs_bound(p_ranges->i->'lower', format('Range %s''s lower bound', i + 1), p_decimals);
    hi := public._bs_bound(p_ranges->i->'upper', format('Range %s''s upper bound', i + 1), p_decimals);
    if lo is null and i > 0 then perform public._bs_fail('invalid_ranges', 'Only the first range can be open at the bottom.'); end if;
    if hi is null and i < n - 1 then perform public._bs_fail('invalid_ranges', 'Only the last range can be open at the top.'); end if;
    if lo is not null and hi is not null and lo >= hi then
      perform public._bs_fail('invalid_ranges', format('Range %s ends before it starts.', i + 1));
    end if;
    if i > 0 and lo <> prev_hi then
      perform public._bs_fail('invalid_ranges', case when lo > prev_hi
        then format('There''s a gap between range %s and range %s.', i, i + 1)
        else format('Range %s overlaps range %s.', i + 1, i) end);
    end if;
    prev_hi := hi;
    out := out || jsonb_build_array(jsonb_build_object('lower', lo, 'upper', hi));
  end loop;
  return out;
end $$;

/** A unit: trimmed, up to 12 characters; empty is allowed (plain numbers). */
create or replace function public._bs_clean_unit(p text) returns text language plpgsql immutable as $$
declare v text := regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if char_length(v) > 12 then perform public._bs_fail('invalid_ranges', 'Keep the unit to 12 characters.'); end if;
  return v;
end $$;

/** Replace a bet's outcome rows with ranges (cleaned already). */
create or replace function public._bs_write_ranges(p_bet_id uuid, p_ranges jsonb, p_unit text, p_decimals int) returns void
language plpgsql set search_path=public as $$
declare i int; lo numeric; hi numeric;
begin
  delete from public.series_bet_outcomes where bet_id = p_bet_id;
  for i in 0..jsonb_array_length(p_ranges) - 1 loop
    lo := (p_ranges->i->>'lower')::numeric;
    hi := (p_ranges->i->>'upper')::numeric;
    insert into public.series_bet_outcomes(bet_id, label, position, lower_bound, upper_bound)
    values (p_bet_id, public._bs_range_label(lo, hi, p_unit, p_decimals), i + 1, lo, hi);
  end loop;
end $$;

/** 0 to 3, defaulting to 0. Fails with invalid_ranges. */
create or replace function public._bs_decimals(p int) returns int language plpgsql immutable as $$
begin
  if coalesce(p, 0) not between 0 and 3 then perform public._bs_fail('invalid_ranges', 'Decimal places must be 0 to 3.'); end if;
  return coalesce(p, 0);
end $$;

drop function if exists public._bs_insert_bet(uuid, text, text[], text, text, int);

/**
 * Insert a bet and its outcome rows.
 *   p_kind RANGE: p_ranges [{ lower, upper }], p_unit, p_decimals.
 *   otherwise: labels for multiple choice; none = YES/NO.
 */
create function public._bs_insert_bet(
  p_series_id uuid, p_question text, p_labels text[], p_tie_rule text, p_status text, p_position int,
  p_kind text default null, p_ranges jsonb default null, p_unit text default null, p_decimals int default null
) returns public.series_bets language plpgsql set search_path=public as $$
declare b public.series_bets; v_labels text[]; v_kind text; v_dec int; v_unit text; v_ranges jsonb; i int;
begin
  v_kind := upper(coalesce(nullif(trim(p_kind), ''), case when coalesce(array_length(p_labels, 1), 0) > 0 then 'MULTI' else 'BINARY' end));
  if v_kind not in ('BINARY','MULTI','RANGE') then perform public._bs_fail('invalid_outcomes', 'Pick YES/NO, multiple choice or a numerical range.'); end if;
  if v_kind = 'RANGE' then
    v_dec := public._bs_decimals(p_decimals);
    v_unit := public._bs_clean_unit(p_unit);
    v_ranges := public._bs_clean_ranges(p_ranges, v_dec);
  elsif v_kind = 'MULTI' then
    v_labels := public._bs_clean_outcomes(p_labels);
  end if;
  insert into public.series_bets(series_id, question, created_by, status, position, opened_at, kind, tie_rule, unit, decimals)
  values (p_series_id, p_question, auth.uid(), p_status, p_position, case when p_status = 'OPEN' then now() end,
    v_kind, case when v_kind = 'MULTI' then public._bs_tie_rule(p_tie_rule) else 'REFUND' end, v_unit, v_dec)
  returning * into b;
  if v_kind = 'RANGE' then
    perform public._bs_write_ranges(b.id, v_ranges, v_unit, v_dec);
  else
    v_labels := coalesce(v_labels, array['YES','NO']);
    for i in 1..array_length(v_labels, 1) loop
      insert into public.series_bet_outcomes(bet_id, label, position) values (b.id, v_labels[i], i);
    end loop;
  end if;
  return b;
end $$;

-- ---------- settlement ----------

drop function if exists public._bs_settle(uuid, uuid, uuid, boolean, uuid[]);

/**
 * Settle a bet (see 0009; unchanged except `p_note`). Winners split the whole pool by
 * stake; rounding leftovers go one coin each to the biggest winning stakes (earlier wager
 * first). Canceled, one-sided, nobody on the winner, a tie under REFUND, or a range result
 * outside every range: everyone is refunded. `p_note`, when given, is the activity line.
 */
create function public._bs_settle(p_series_id uuid, p_bet_id uuid, p_outcome_id uuid, p_cancel boolean, p_tied uuid[] default null, p_note text default null)
returns jsonb language plpgsql set search_path=public as $$
declare b public.series_bets; v_total bigint; v_win bigint; v_refund boolean; v_left bigint; v_seq int; v_payouts jsonb;
  v_label text := public._bs_label(p_outcome_id); v_tied_labels text;
begin
  select * into b from public.series_bets where id = p_bet_id;
  select coalesce(sum(amount), 0) into v_total from public.series_wagers where bet_id = p_bet_id;
  select coalesce(sum(amount), 0) into v_win from public.series_wagers where bet_id = p_bet_id and outcome_id = p_outcome_id;
  v_refund := p_cancel or p_outcome_id is null or v_win = 0 or v_win = v_total;

  insert into public.series_bet_results(bet_id, user_id, side, outcome_id, stake, payout, net, first_at, first_seq)
  select p_bet_id, w.user_id, (array_agg(w.outcome order by w.placed_seq))[1], (array_agg(w.outcome_id order by w.placed_seq))[1],
    sum(w.amount), 0, 0, min(w.created_at), min(w.placed_seq)
  from public.series_wagers w where w.bet_id = p_bet_id group by w.user_id;

  if v_refund then
    update public.series_bet_results set payout = stake where bet_id = p_bet_id;
  else
    update public.series_bet_results set payout = (stake * v_total) / v_win where bet_id = p_bet_id and outcome_id = p_outcome_id;
    select v_total - coalesce(sum(payout), 0) into v_left from public.series_bet_results where bet_id = p_bet_id;
    update public.series_bet_results r set payout = r.payout + 1
    from (
      select x.user_id from public.series_bet_results x
      where x.bet_id = p_bet_id and x.outcome_id = p_outcome_id
      order by x.stake desc, x.first_seq limit v_left
    ) t
    where r.bet_id = p_bet_id and r.user_id = t.user_id;
  end if;
  update public.series_bet_results set net = payout - stake where bet_id = p_bet_id;

  update public.bet_series_participants p set balance = p.balance + r.payout
  from public.series_bet_results r
  where r.bet_id = p_bet_id and p.series_id = p_series_id and p.user_id = r.user_id;

  if not p_cancel then
    select coalesce(max(seq), 0) + 1 into v_seq from public.series_bets where series_id = p_series_id;
  end if;
  update public.series_bets set
    status = case when p_cancel then 'CANCELLED' else 'RESOLVED' end,
    winning_outcome_id = case when p_cancel then null else p_outcome_id end,
    winning_outcome = case when p_cancel then null else v_label end,
    tied_outcome_ids = case when p_cancel then null else p_tied end,
    refunded = v_refund, closed_at = coalesce(closed_at, now()), settled_at = now(), seq = v_seq
  where id = p_bet_id returning * into b;

  select string_agg(o.label, ' and ' order by o.position) into v_tied_labels
  from public.series_bet_outcomes o where o.id = any(coalesce(p_tied, '{}'));
  perform public._bs_log(p_series_id, case
    when p_cancel then 'Canceled, coins returned: ' || b.question
    when p_note is not null then p_note || case when v_refund and p_outcome_id is not null then ' (nobody else to win from, so coins went back)' else '' end
    when v_tied_labels is not null and p_outcome_id is null then 'Tie between ' || v_tied_labels || ', so coins went back: ' || b.question
    when v_tied_labels is not null then 'Tie between ' || v_tied_labels || '; ' || v_label || ' was listed first: ' || b.question
      || case when v_refund then ' (nobody was on ' || v_label || ' alone, so coins went back)' else '' end
    when p_outcome_id is null then 'Everyone was on one side, so coins went back: ' || b.question
    else v_label || ': ' || b.question || case when v_refund then ' (everyone was on one side, so coins went back)' else '' end
  end);

  select coalesce(jsonb_agg(jsonb_build_object('userId', user_id, 'gross', payout, 'net', net, 'refunded', v_refund) order by user_id), '[]')
  into v_payouts from public.series_bet_results where bet_id = p_bet_id;

  perform public._bs_maybe_finish(p_series_id);
  return jsonb_build_object('betId', b.id, 'status', b.status, 'pool', v_total, 'refunded', v_refund, 'payouts', v_payouts,
    'outcomeId', b.winning_outcome_id, 'tiedOutcomeIds', to_jsonb(b.tied_outcome_ids), 'resultValue', b.result_value);
end $$;

drop function if exists public.finish_series_bet(uuid, uuid, text, boolean, text[]);

/**
 * Resolve (p_cancel = false) or cancel (true) an open or locked bet. Settles exactly once.
 *   YES/NO and multiple choice: p_outcome (id or label), or p_tied for a tie (see 0009).
 *   Range: p_value, the measured number. The range holding it wins (lower ≤ value < upper);
 *   a value outside every range refunds everyone. Naming a range by hand is refused.
 */
create function public.finish_series_bet(
  p_series_id uuid, p_bet_id uuid, p_outcome text, p_cancel boolean default false, p_tied text[] default null, p_value numeric default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; o public.series_bet_outcomes; v_tied uuid[] := '{}'; v_ref text; v_winner uuid; v_shown text;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  if s.status <> 'ACTIVE' then perform public._bs_fail('series_not_active', 'The series isn''t running.'); end if;
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status not in ('OPEN','LOCKED') then perform public._bs_fail('bet_not_open', 'This bet is already finished.'); end if;
  if coalesce(p_cancel, false) then return public._bs_settle(s.id, b.id, null, true); end if;

  if b.kind = 'RANGE' then
    if p_outcome is not null or coalesce(array_length(p_tied, 1), 0) > 0 then
      perform public._bs_fail('invalid_outcome', 'Enter the measured result. The matching range is picked for you.');
    end if;
    if p_value is null then perform public._bs_fail('invalid_result', 'Enter the result as a number.'); end if;
    if p_value <> round(p_value, b.decimals) then
      perform public._bs_fail('invalid_result', format('This bet is measured to %s decimal place%s.', b.decimals, case when b.decimals = 1 then '' else 's' end));
    end if;
    select * into o from public.series_bet_outcomes
    where bet_id = b.id and (lower_bound is null or lower_bound <= p_value) and (upper_bound is null or p_value < upper_bound);
    update public.series_bets set result_value = p_value where id = b.id;
    v_shown := public._bs_with_unit(public._bs_num(p_value, b.decimals), b.unit);
    return public._bs_settle(s.id, b.id, o.id, false, null,
      case when o.id is null then 'Result ' || v_shown || ' is outside every range, so coins went back: ' || b.question
      else 'Result ' || v_shown || ' → ' || o.label || ': ' || b.question end);
  end if;

  if p_value is not null then perform public._bs_fail('invalid_result', 'Only range bets take a number. Pick the outcome instead.'); end if;

  if coalesce(array_length(p_tied, 1), 0) > 0 then
    if b.kind = 'BINARY' then perform public._bs_fail('invalid_outcome', 'A YES/NO bet can''t tie. Pick YES or NO, or cancel it.'); end if;
    foreach v_ref in array p_tied loop
      o := public._bs_outcome(b.id, v_ref);
      if o.id is null then perform public._bs_fail('invalid_outcome', 'One of those outcomes isn''t on this bet.'); end if;
      if not (o.id = any(v_tied)) then v_tied := v_tied || o.id; end if;
    end loop;
    if array_length(v_tied, 1) < 2 then perform public._bs_fail('invalid_outcome', 'A tie needs at least two different outcomes.'); end if;
    if b.tie_rule = 'FIRST_LISTED' then
      select id into v_winner from public.series_bet_outcomes where id = any(v_tied) order by position limit 1;
    end if;
    return public._bs_settle(s.id, b.id, v_winner, false, v_tied);
  end if;

  o := public._bs_outcome(b.id, p_outcome);
  if o.id is null then
    perform public._bs_fail('invalid_outcome', case when b.kind = 'BINARY' then 'Pick YES or NO.' else 'Pick the outcome that won.' end);
  end if;
  return public._bs_settle(s.id, b.id, o.id, false);
end $$;

-- ---------- creating and editing bets ----------

/**
 * Create a lobby (see 0009). Bets in p_bets may now also be ranges:
 *   { question, kind: "range", ranges: [{ lower, upper }], unit?, decimals? }.
 */
create or replace function public.create_bet_series(
  p_title text, p_description text, p_planned_bet_count integer, p_initial_bankroll bigint,
  p_loser_count integer, p_stake_mode text, p_questions text[] default '{}', p_settings jsonb default '{}', p_bets jsonb default null
) returns public.bet_series language plpgsql security definer set search_path=public as $$
declare
  s public.bet_series;
  v_mode text := upper(coalesce(p_stake_mode, ''));
  v_bets jsonb;
  v_nq int;
  v_tiebreak text := upper(coalesce(p_settings->>'tiebreak', 'first'));
  v_creation text;
  v_withdraw int := public._bs_int(p_settings, 'withdrawMinutes', 0);
  v_favors int := public._bs_int(p_settings, 'favorsPerPlayer', 1);
  v_min int := public._bs_int(p_settings, 'minContribution', 5);
  v_host_plays boolean := public._bs_bool(p_settings, 'hostPlays', true);
  v_q text;
  v_item jsonb;
  v_labels text[];
  i int;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  if p_bets is not null and jsonb_typeof(p_bets) <> 'array' then perform public._bs_fail('invalid_question', 'Bets must be a list.'); end if;
  if p_bets is not null and coalesce(array_length(p_questions, 1), 0) > 0 then
    perform public._bs_fail('invalid_question', 'Send questions or bets, not both.');
  end if;
  v_bets := coalesce(p_bets, (select coalesce(jsonb_agg(jsonb_build_object('question', q) order by n), '[]') from unnest(coalesce(p_questions, '{}')) with ordinality as x(q, n)));
  v_nq := jsonb_array_length(v_bets);
  v_creation := upper(coalesce(p_settings->>'betCreation', case when v_nq = p_planned_bet_count then 'upfront' else 'during' end));

  if p_title is null or char_length(trim(p_title)) not between 1 and 100 then
    perform public._bs_fail('invalid_title', 'Give the series a name (up to 100 characters).');
  end if;
  if char_length(coalesce(p_description, '')) > 280 then perform public._bs_fail('invalid_description', 'Keep the description under 280 characters.'); end if;
  if v_mode not in ('SHARED_FAVOR_POOL','PLEDGE','MONEY') then perform public._bs_fail('invalid_stake_mode', 'Pick a mode.'); end if;
  if p_planned_bet_count is null or p_planned_bet_count not between 1 and 50 then
    perform public._bs_fail('invalid_series', 'Number of bets must be a whole number from 1 to 50.');
  end if;
  if p_loser_count is null or p_loser_count not between 1 and 20 then
    perform public._bs_fail('invalid_series', 'Number of losing players must be a whole number from 1 to 20.');
  end if;
  if p_initial_bankroll is null or p_initial_bankroll not between 100 and 100000 then
    perform public._bs_fail('invalid_series', 'Starting coins must be a whole number from 100 to 100,000.');
  end if;
  if v_tiebreak not in ('FIRST','RANDOM') then perform public._bs_fail('invalid_settings', 'Pick a tiebreak.'); end if;
  if v_creation not in ('UPFRONT','DURING') then perform public._bs_fail('invalid_settings', 'Pick when bets can be written.'); end if;
  if v_withdraw is null or v_withdraw not between 0 and 60 then
    perform public._bs_fail('invalid_settings', 'Withdrawal window must be a whole number of minutes from 0 to 60.');
  end if;
  if v_mode = 'SHARED_FAVOR_POOL' then
    if v_favors is null or v_favors not between 1 and 5 then perform public._bs_fail('invalid_settings', 'Favors per player must be a whole number from 1 to 5.'); end if;
  else
    v_favors := 1;
  end if;
  if v_mode = 'MONEY' then
    if v_min is null or v_min not between 1 and 10000 then perform public._bs_fail('invalid_settings', 'Minimum contribution must be a whole number from 1 to 10,000.'); end if;
  else
    v_min := 0;
  end if;
  if v_nq > p_planned_bet_count then
    perform public._bs_fail('planned_questions_full', format('This series has %s bets; you wrote %s questions.', p_planned_bet_count, v_nq));
  end if;

  insert into public.bet_series(title, description, host_user_id, planned_bet_count, initial_bankroll, loser_count, stake_mode,
    invite_code, min_contribution, favors_per_player, exclusive_pool, tiebreak, bet_creation, withdraw_minutes, host_plays)
  values (trim(p_title), trim(coalesce(p_description, '')), auth.uid(), p_planned_bet_count, p_initial_bankroll, p_loser_count, v_mode,
    public._bs_new_code(), v_min, v_favors, public._bs_bool(p_settings, 'exclusivePool', true), v_tiebreak, v_creation, v_withdraw, v_host_plays)
  returning * into s;
  insert into public.bet_series_participants(series_id, user_id, display_name, avatar_url, plays)
  values (s.id, auth.uid(), public._bs_me_name(), public._bs_me_avatar(), v_host_plays);

  for i in 1..v_nq loop
    v_item := v_bets->(i - 1);
    v_q := regexp_replace(trim(coalesce(case when jsonb_typeof(v_item) = 'object' then v_item->>'question' end, '')), '\s+', ' ', 'g');
    if char_length(v_q) not between 3 and 300 then perform public._bs_fail('invalid_question', format('Write question %s (3 to 300 characters).', i)); end if;
    v_labels := case when jsonb_typeof(v_item->'outcomes') = 'array'
      then array(select jsonb_array_elements_text(v_item->'outcomes')) else '{}' end;
    perform public._bs_insert_bet(s.id, v_q, v_labels, v_item->>'tieRule', 'PLANNED', i,
      v_item->>'kind', v_item->'ranges', v_item->>'unit', case when jsonb_typeof(v_item->'decimals') = 'number' then (v_item->>'decimals')::int end);
  end loop;
  perform public._bs_log(s.id, public._bs_me_name() || ' created the series.');
  return s;
end $$;

drop function if exists public.create_series_bet(uuid, text, text[], text);

/**
 * Host writes a bet: in the lobby, or mid-series when allowed (it opens right away,
 * which locks its outcomes). p_kind "range" takes p_ranges, p_unit, p_decimals;
 * otherwise outcomes = multiple choice, none = YES/NO.
 */
create function public.create_series_bet(
  p_series_id uuid, p_question text, p_outcomes text[] default null, p_tie_rule text default null,
  p_kind text default null, p_ranges jsonb default null, p_unit text default null, p_decimals int default null
) returns public.series_bets language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; v_q text; v_n int; v_pos int;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  v_q := regexp_replace(trim(coalesce(p_question, '')), '\s+', ' ', 'g');
  if char_length(v_q) not between 3 and 300 then perform public._bs_fail('invalid_question', 'Write the question (3 to 300 characters).'); end if;
  if s.status = 'ACTIVE' and s.bet_creation <> 'DURING' then perform public._bs_fail('questions_locked', 'This series locked its bets before it started.'); end if;
  if s.status not in ('LOBBY','ACTIVE') then perform public._bs_fail('series_over', 'This series is over.'); end if;
  select count(*), coalesce(max(position), 0) + 1 into v_n, v_pos from public.series_bets where series_id = s.id;
  if v_n >= s.planned_bet_count then
    perform public._bs_fail('planned_questions_full', format('This series has %s bet%s, and they''re all written.', s.planned_bet_count, case when s.planned_bet_count = 1 then '' else 's' end));
  end if;
  b := public._bs_insert_bet(s.id, v_q, p_outcomes, p_tie_rule, case when s.status = 'LOBBY' then 'PLANNED' else 'OPEN' end, v_pos,
    p_kind, p_ranges, p_unit, p_decimals);
  if s.status = 'ACTIVE' then perform public._bs_log(s.id, 'New bet: ' || v_q); end if;
  return b;
end $$;

drop function if exists public.update_series_bet(uuid, uuid, text, text, jsonb, text);

/**
 * Host edits a draft bet (see 0009). Now also:
 *   p_kind "range" with p_ranges [{ lower, upper }], p_unit, p_decimals. A range edit
 *   replaces the ranges (nobody can have wagered on a draft). Unit or precision alone
 *   can change too; the existing ranges are rechecked against the new precision.
 * Once the bet opens, everything is locked: outcomes_locked.
 */
create function public.update_series_bet(
  p_series_id uuid, p_bet_id uuid, p_question text default null, p_kind text default null,
  p_outcomes jsonb default null, p_tie_rule text default null,
  p_ranges jsonb default null, p_unit text default null, p_decimals int default null
) returns public.series_bets language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; v_q text; v_kind text; v_labels text[]; v_ids uuid[]; v_item jsonb; v_id uuid; i int;
  v_dec int; v_unit text; v_ranges jsonb;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status <> 'PLANNED' then perform public._bs_fail('outcomes_locked', 'Betting on this bet has started, so it can''t be changed. Cancel it instead.'); end if;

  if p_question is not null then
    v_q := regexp_replace(trim(p_question), '\s+', ' ', 'g');
    if char_length(v_q) not between 3 and 300 then perform public._bs_fail('invalid_question', 'Write the question (3 to 300 characters).'); end if;
    update public.series_bets set question = v_q where id = b.id;
  end if;

  v_kind := upper(coalesce(nullif(trim(p_kind), ''),
    case when p_ranges is not null then 'RANGE' when p_outcomes is not null then 'MULTI' else b.kind end));
  if v_kind not in ('BINARY','MULTI','RANGE') then perform public._bs_fail('invalid_outcomes', 'Pick YES/NO, multiple choice or a numerical range.'); end if;

  if v_kind = 'RANGE' then
    v_dec := public._bs_decimals(coalesce(p_decimals, b.decimals));
    v_unit := public._bs_clean_unit(coalesce(p_unit, b.unit));
    if p_ranges is not null then
      v_ranges := public._bs_clean_ranges(p_ranges, v_dec);
    elsif b.kind = 'RANGE' then
      -- Same ranges, maybe a new unit or precision: recheck and relabel them.
      select public._bs_clean_ranges(coalesce(jsonb_agg(jsonb_build_object('lower', lower_bound, 'upper', upper_bound) order by position), '[]'), v_dec)
      into v_ranges from public.series_bet_outcomes where bet_id = b.id;
    else
      perform public._bs_fail('invalid_ranges', 'List the ranges for a range bet.');
    end if;
    perform public._bs_write_ranges(b.id, v_ranges, v_unit, v_dec);
    update public.series_bets set kind = 'RANGE', tie_rule = 'REFUND', unit = v_unit, decimals = v_dec where id = b.id;
  elsif v_kind = 'BINARY' then
    if b.kind <> 'BINARY' then
      delete from public.series_bet_outcomes where bet_id = b.id;
      insert into public.series_bet_outcomes(bet_id, label, position) values (b.id, 'YES', 1), (b.id, 'NO', 2);
    end if;
    update public.series_bets set kind = 'BINARY', tie_rule = 'REFUND', unit = null, decimals = null where id = b.id;
  else
    if p_outcomes is null and b.kind <> 'MULTI' then
      perform public._bs_fail('invalid_outcomes', 'List the outcomes for a multiple-choice bet.');
    end if;
    if p_outcomes is not null then
      if jsonb_typeof(p_outcomes) <> 'array' then perform public._bs_fail('invalid_outcomes', 'Outcomes must be a list.'); end if;
      v_labels := '{}'; v_ids := '{}';
      for i in 0..jsonb_array_length(p_outcomes) - 1 loop
        v_item := p_outcomes->i;
        if jsonb_typeof(v_item) = 'string' then v_item := jsonb_build_object('label', v_item); end if;
        if jsonb_typeof(v_item) <> 'object' then perform public._bs_fail('invalid_outcomes', 'Each outcome needs a label.'); end if;
        v_id := null;
        if v_item->>'id' is not null and b.kind = 'MULTI' then
          select o.id into v_id from public.series_bet_outcomes o where o.bet_id = b.id and o.id::text = lower(v_item->>'id');
          if v_id is null then perform public._bs_fail('invalid_outcomes', 'One of those outcomes isn''t on this bet.'); end if;
          if v_id = any(v_ids) then perform public._bs_fail('invalid_outcomes', 'An outcome is listed twice.'); end if;
        elsif v_item->>'id' is not null then
          perform public._bs_fail('invalid_outcomes', 'One of those outcomes isn''t on this bet.');
        end if;
        v_labels := v_labels || coalesce(v_item->>'label', '');
        v_ids := v_ids || v_id;
      end loop;
      v_labels := public._bs_clean_outcomes(v_labels);
      delete from public.series_bet_outcomes where bet_id = b.id and not (id = any(array_remove(v_ids, null)));
      update public.series_bet_outcomes set label = id::text, position = position + 1000, lower_bound = null, upper_bound = null where bet_id = b.id;
      for i in 1..array_length(v_labels, 1) loop
        if v_ids[i] is null then
          insert into public.series_bet_outcomes(bet_id, label, position) values (b.id, v_labels[i], i);
        else
          update public.series_bet_outcomes set label = v_labels[i], position = i where id = v_ids[i];
        end if;
      end loop;
    end if;
    update public.series_bets set kind = 'MULTI', unit = null, decimals = null,
      tie_rule = case when p_tie_rule is not null or b.kind <> 'MULTI' then public._bs_tie_rule(p_tie_rule) else b.tie_rule end
    where id = b.id;
  end if;

  select * into b from public.series_bets where id = b.id;
  return b;
end $$;

-- ---------- one read for the app ----------

/** A series the way the app shows it (see 0009). Range bets add unit, decimals, resultValue and per-outcome bounds. */
create or replace function public._bs_series_json(p_series_id uuid) returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object(
    'id', s.id, 'code', s.invite_code, 'name', s.title, 'description', s.description, 'hostId', s.host_user_id,
    'createdAt', public._bs_iso(s.created_at), 'startedAt', public._bs_iso(s.started_at), 'finishedAt', public._bs_iso(s.completed_at),
    'status', case s.status
      when 'LOBBY' then 'lobby'
      when 'ACTIVE' then 'active'
      when 'COMPLETED' then case when exists (
        select 1 from public.series_favor_assignments a where a.series_id = s.id and a.status in ('PICKING','DECLINED')
      ) then 'assigning' else 'finished' end
      else 'finished' end,
    'settings', jsonb_build_object(
      'betCount', s.planned_bet_count, 'losers', s.loser_count, 'startingCoins', s.initial_bankroll,
      'mode', case s.stake_mode when 'MONEY' then 'money' when 'PLEDGE' then 'pledge' else 'pool' end,
      'minContribution', s.min_contribution, 'favorsPerPlayer', s.favors_per_player, 'exclusivePool', s.exclusive_pool,
      'tiebreak', lower(s.tiebreak), 'betCreation', lower(s.bet_creation), 'withdrawMinutes', s.withdraw_minutes, 'hostPlays', s.host_plays),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', p.user_id, 'name', p.display_name, 'avatarUrl', p.avatar_url, 'status', 'joined',
        'ready', p.ready, 'plays', p.plays, 'joinedAt', public._bs_iso(p.joined_at)
      ) order by p.join_seq), '[]'::jsonb)
      from public.bet_series_participants p where p.series_id = s.id),
    'favors', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'authorId', f.submitted_by, 'text', f.description, 'createdAt', public._bs_iso(f.created_at),
        'agreedBy', to_jsonb(f.consented_by)
      ) order by f.created_at, f.id), '[]'::jsonb)
      from public.series_favors f where f.series_id = s.id and not f.withdrawn),
    'bets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'question', b.question, 'createdAt', public._bs_iso(b.created_at), 'position', b.position,
        'kind', lower(b.kind), 'tieRule', lower(b.tie_rule),
        'unit', b.unit, 'decimals', b.decimals, 'resultValue', b.result_value,
        'status', case b.status when 'PLANNED' then 'draft' when 'OPEN' then 'open' when 'LOCKED' then 'closed'
          when 'RESOLVED' then 'resolved' else 'canceled' end,
        'openedAt', public._bs_iso(b.opened_at), 'closedAt', public._bs_iso(b.closed_at), 'settledAt', public._bs_iso(b.settled_at),
        'outcomes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'position', o.position, 'lower', o.lower_bound, 'upper', o.upper_bound,
            'pool', (select coalesce(sum(w.amount), 0) from public.series_wagers w where w.outcome_id = o.id),
            'backers', (select count(distinct w.user_id) from public.series_wagers w where w.outcome_id = o.id)
          ) order by o.position), '[]'::jsonb)
          from public.series_bet_outcomes o where o.bet_id = b.id),
        'outcome', lower(b.winning_outcome), 'outcomeId', b.winning_outcome_id, 'tiedOutcomeIds', to_jsonb(b.tied_outcome_ids),
        'seq', b.seq, 'refunded', b.refunded,
        'wagers', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'userId', w.user_id, 'outcomeId', w.outcome_id, 'side', lower(w.side), 'amount', w.amount,
            'firstAt', public._bs_iso(w.first_at), 'updatedAt', public._bs_iso(w.updated_at)
          ) order by w.first_seq), '[]'::jsonb)
          from (
            select user_id, (array_agg(outcome_id order by placed_seq))[1] as outcome_id, (array_agg(outcome order by placed_seq))[1] as side,
              sum(amount) as amount, min(created_at) as first_at, max(created_at) as updated_at, min(placed_seq) as first_seq
            from public.series_wagers where bet_id = b.id group by user_id
          ) w),
        'results', case when b.status in ('RESOLVED','CANCELLED') then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'userId', r.user_id, 'outcomeId', r.outcome_id, 'stake', r.stake, 'payout', r.payout, 'net', r.net, 'firstAt', public._bs_iso(r.first_at)
          ) order by r.first_seq), '[]'::jsonb)
          from public.series_bet_results r where r.bet_id = b.id) end
      ) order by b.position), '[]'::jsonb)
      from public.series_bets b where b.series_id = s.id),
    'randomOrder', to_jsonb(s.random_order),
    'finalOrder', to_jsonb(s.final_order),
    'assignments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'loserId', a.loser_id, 'chooserId', a.winner_id, 'favorId', a.favor_id, 'text', a.text, 'done', a.done,
        'status', case a.status when 'PICKING' then 'picking' when 'PENDING_CONSENT' then 'pending'
          when 'CONSENTED' then 'accepted' else 'declined' end
      ) order by a.position), '[]'::jsonb)
      from public.series_favor_assignments a where a.series_id = s.id),
    'activity', (
      select coalesce(jsonb_agg(jsonb_build_object('at', public._bs_iso(x.at), 'text', x.text) order by x.id desc), '[]'::jsonb)
      from (select * from public.series_activity where series_id = s.id order by id desc limit 50) x),
    'standings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'userId', st.user_id, 'rank', st.rank, 'coins', st.coins, 'atStake', st.at_stake, 'available', st.available,
        'reachedSeq', st.reached_seq, 'losing', st.losing
      ) order by st.rank), '[]'::jsonb)
      from public._bs_standings(s.id) st),
    'blockers', case when s.status = 'LOBBY' then (
      select coalesce(jsonb_agg(bl.message), '[]'::jsonb) from public._bs_blockers(s.id) bl
    ) else '[]'::jsonb end
  )
  from public.bet_series s where s.id = p_series_id
$$;

-- ---------- permissions ----------

revoke all on function
  public._bs_num(numeric, int), public._bs_with_unit(text, text), public._bs_range_label(numeric, numeric, text, int),
  public._bs_bound(jsonb, text, int), public._bs_clean_ranges(jsonb, int), public._bs_clean_unit(text),
  public._bs_write_ranges(uuid, jsonb, text, int), public._bs_decimals(int),
  public._bs_insert_bet(uuid, text, text[], text, text, int, text, jsonb, text, int),
  public._bs_settle(uuid, uuid, uuid, boolean, uuid[], text), public._bs_series_json(uuid)
from public, anon, authenticated;

revoke all on function
  public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb, jsonb),
  public.create_series_bet(uuid, text, text[], text, text, jsonb, text, int),
  public.update_series_bet(uuid, uuid, text, text, jsonb, text, jsonb, text, int),
  public.finish_series_bet(uuid, uuid, text, boolean, text[], numeric)
from public, anon;

grant execute on function
  public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb, jsonb),
  public.create_series_bet(uuid, text, text[], text, text, jsonb, text, int),
  public.update_series_bet(uuid, uuid, text, text, jsonb, text, jsonb, text, int),
  public.finish_series_bet(uuid, uuid, text, boolean, text[], numeric)
to authenticated;
