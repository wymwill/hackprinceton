-- Bet Series: bets with 2 to 10 custom outcomes, not just YES/NO.
--
-- Every outcome is a row with a stable id. Wagers, winners and results point at
-- outcome ids; the old text columns (series_wagers.outcome, series_bets.winning_outcome,
-- series_bet_results.side) are kept and filled with the outcome's label, so older
-- readers keep working. Existing bets become YES/NO bets with two outcome rows.
--
-- Rules added here:
--   * a bet is BINARY (YES/NO, the default) or MULTI (2 to 10 labels, unique ignoring case)
--   * outcomes, their order and the tie rule can be edited only while the bet is a
--     draft; they lock when betting on the bet opens
--   * a MULTI bet declares a tie rule up front: REFUND (everyone gets their coins back)
--     or FIRST_LISTED (the earliest-listed of the tied outcomes wins). There is always
--     at most one winning outcome.
-- Unchanged: one wager side per player (add, never switch), balance checks, the
-- withdrawal window, refunds, rounding, and settling exactly once under the series lock.

-- ---------- schema ----------

create table if not exists public.series_bet_outcomes (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.series_bets(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  position integer not null check (position >= 1),
  -- Deferrable so a reorder can swap positions inside one statement.
  constraint series_bet_outcomes_position_unique unique (bet_id, position) deferrable initially immediate
);
create unique index if not exists series_bet_outcomes_label_unique on public.series_bet_outcomes(bet_id, lower(label));

alter table public.series_bets
  add column if not exists kind text not null default 'BINARY',
  add column if not exists tie_rule text not null default 'REFUND',
  add column if not exists winning_outcome_id uuid references public.series_bet_outcomes(id),
  add column if not exists tied_outcome_ids uuid[];
alter table public.series_bets drop constraint if exists series_bets_kind_check;
alter table public.series_bets add constraint series_bets_kind_check check (kind in ('BINARY','MULTI') and tie_rule in ('REFUND','FIRST_LISTED'));
alter table public.series_bets drop constraint if exists series_bets_winning_outcome_check;

alter table public.series_wagers add column if not exists outcome_id uuid references public.series_bet_outcomes(id);
alter table public.series_wagers drop constraint if exists series_wagers_outcome_check;
create index if not exists series_wagers_bet_outcome_idx on public.series_wagers(bet_id, outcome_id);

alter table public.series_bet_results add column if not exists outcome_id uuid references public.series_bet_outcomes(id);
alter table public.series_bet_results drop constraint if exists series_bet_results_side_check;

-- Existing bets are YES/NO: give each one its two outcome rows and link everything to them.
insert into public.series_bet_outcomes(bet_id, label, position)
select b.id, v.label, v.position
from public.series_bets b cross join (values ('YES', 1), ('NO', 2)) as v(label, position)
where not exists (select 1 from public.series_bet_outcomes o where o.bet_id = b.id);

update public.series_wagers w set outcome_id = o.id
from public.series_bet_outcomes o where o.bet_id = w.bet_id and o.label = w.outcome and w.outcome_id is null;
update public.series_bets b set winning_outcome_id = o.id
from public.series_bet_outcomes o where o.bet_id = b.id and o.label = b.winning_outcome and b.winning_outcome_id is null;
update public.series_bet_results r set outcome_id = o.id
from public.series_bet_outcomes o where o.bet_id = r.bet_id and o.label = r.side and r.outcome_id is null;

alter table public.series_wagers alter column outcome_id set not null;

alter table public.series_bet_outcomes enable row level security;
drop policy if exists "members read outcomes" on public.series_bet_outcomes;
create policy "members read outcomes" on public.series_bet_outcomes for select to authenticated using (
  exists (select 1 from public.series_bets b where b.id = bet_id and public.is_bet_series_member(b.series_id, auth.uid()))
);
revoke all on public.series_bet_outcomes from anon, authenticated;
grant select on public.series_bet_outcomes to authenticated;

-- ---------- helpers (internal) ----------

/**
 * Clean and check a list of outcome labels: trimmed, inner spaces collapsed, 1 to 60
 * characters, 2 to 10 of them, no two the same ignoring case. Fails with invalid_outcomes.
 */
create or replace function public._bs_clean_outcomes(p_labels text[]) returns text[] language plpgsql immutable as $$
declare v text[] := '{}'; l text; i int;
begin
  for i in 1..coalesce(array_length(p_labels, 1), 0) loop
    l := regexp_replace(trim(coalesce(p_labels[i], '')), '\s+', ' ', 'g');
    if char_length(l) not between 1 and 60 then
      perform public._bs_fail('invalid_outcomes', format('Name outcome %s (1 to 60 characters).', i));
    end if;
    if exists (select 1 from unnest(v) x where lower(x) = lower(l)) then
      perform public._bs_fail('invalid_outcomes', format('"%s" is listed twice. Each outcome needs a different name.', l));
    end if;
    v := v || l;
  end loop;
  if coalesce(array_length(v, 1), 0) not between 2 and 10 then
    perform public._bs_fail('invalid_outcomes', 'A multiple-choice bet needs 2 to 10 outcomes.');
  end if;
  return v;
end $$;

/** 'refund' / 'first_listed' (any case) → REFUND / FIRST_LISTED; null → REFUND. Fails with invalid_tie_rule. */
create or replace function public._bs_tie_rule(p text) returns text language plpgsql immutable as $$
declare v text := upper(coalesce(nullif(trim(p), ''), 'REFUND'));
begin
  if v not in ('REFUND','FIRST_LISTED') then perform public._bs_fail('invalid_tie_rule', 'Pick what happens on a tie: refund everyone, or the first-listed outcome wins.'); end if;
  return v;
end $$;

/** Insert a bet and its outcome rows. Null or empty labels = a YES/NO bet. */
create or replace function public._bs_insert_bet(
  p_series_id uuid, p_question text, p_labels text[], p_tie_rule text, p_status text, p_position int
) returns public.series_bets language plpgsql set search_path=public as $$
declare b public.series_bets; v_labels text[]; v_multi boolean := coalesce(array_length(p_labels, 1), 0) > 0; i int;
begin
  v_labels := case when v_multi then public._bs_clean_outcomes(p_labels) else array['YES','NO'] end;
  insert into public.series_bets(series_id, question, created_by, status, position, opened_at, kind, tie_rule)
  values (p_series_id, p_question, auth.uid(), p_status, p_position, case when p_status = 'OPEN' then now() end,
    case when v_multi then 'MULTI' else 'BINARY' end, case when v_multi then public._bs_tie_rule(p_tie_rule) else 'REFUND' end)
  returning * into b;
  for i in 1..array_length(v_labels, 1) loop
    insert into public.series_bet_outcomes(bet_id, label, position) values (b.id, v_labels[i], i);
  end loop;
  return b;
end $$;

/** One of a bet's outcomes, by id or by label (any case). Null when it isn't one of this bet's. */
create or replace function public._bs_outcome(p_bet_id uuid, p_ref text) returns public.series_bet_outcomes
language sql stable set search_path=public as $$
  select o.* from public.series_bet_outcomes o
  -- Compared as text: SQL doesn't short-circuit, so casting a label like "YES" to uuid would fail.
  where o.bet_id = p_bet_id and (
    o.id::text = lower(trim(coalesce(p_ref, '')))
    or lower(o.label) = lower(trim(coalesce(p_ref, '')))
  )
  order by (o.id::text = lower(trim(coalesce(p_ref, '')))) desc
  limit 1
$$;

create or replace function public._bs_label(p_outcome_id uuid) returns text language sql stable set search_path=public as $$
  select label from public.series_bet_outcomes where id = p_outcome_id
$$;

-- ---------- settlement ----------

drop function if exists public._bs_settle(uuid, uuid, text, boolean);

/**
 * Settle a bet. Winners split the whole pool by stake; rounding leftovers go one coin
 * each to the biggest winning stakes (earlier wager first), so payouts add up to the
 * pool exactly. Canceled, one-sided, nobody on the winning outcome, or a tie under the
 * REFUND rule: everyone is refunded. A null winner with no tie means "refund" (locking
 * a one-sided pool). `p_tied` records which outcomes tied, when the host reported a tie.
 * Callers hold the series lock and have checked the bet is still OPEN or LOCKED.
 */
create function public._bs_settle(p_series_id uuid, p_bet_id uuid, p_outcome_id uuid, p_cancel boolean, p_tied uuid[] default null)
returns jsonb language plpgsql set search_path=public as $$
declare b public.series_bets; v_total bigint; v_win bigint; v_refund boolean; v_left bigint; v_seq int; v_payouts jsonb;
  v_label text := public._bs_label(p_outcome_id); v_tied_labels text;
begin
  select * into b from public.series_bets where id = p_bet_id;
  select coalesce(sum(amount), 0) into v_total from public.series_wagers where bet_id = p_bet_id;
  select coalesce(sum(amount), 0) into v_win from public.series_wagers where bet_id = p_bet_id and outcome_id = p_outcome_id;
  v_refund := p_cancel or p_outcome_id is null or v_win = 0 or v_win = v_total;

  -- One row per player. A player is only ever on one outcome of a bet, so any of their wagers names it.
  insert into public.series_bet_results(bet_id, user_id, side, outcome_id, stake, payout, net, first_at, first_seq)
  select p_bet_id, w.user_id, (array_agg(w.outcome order by w.placed_seq))[1], (array_agg(w.outcome_id order by w.placed_seq))[1],
    sum(w.amount), 0, 0, min(w.created_at), min(w.placed_seq)
  from public.series_wagers w where w.bet_id = p_bet_id group by w.user_id;

  if v_refund then
    update public.series_bet_results set payout = stake where bet_id = p_bet_id;
  else
    update public.series_bet_results set payout = (stake * v_total) / v_win where bet_id = p_bet_id and outcome_id = p_outcome_id;
    select v_total - coalesce(sum(payout), 0) into v_left from public.series_bet_results where bet_id = p_bet_id;
    -- Flooring loses less than one coin per winner, so one pass hands out the rest.
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
    'outcomeId', b.winning_outcome_id, 'tiedOutcomeIds', to_jsonb(b.tied_outcome_ids));
end $$;

-- ---------- creating and editing bets ----------

drop function if exists public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb);

/**
 * Create a lobby. Bets can be given two ways (not both):
 *   p_questions: YES/NO questions, as before;
 *   p_bets: [{ question, outcomes?: [labels], tieRule?: "refund" | "first_listed" }],
 *           where no outcomes means YES/NO.
 * `p_settings` holds the advanced rules, camelCase (see 0007).
 */
create function public.create_bet_series(
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
  -- Normalize both forms to one list of bet objects.
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
    perform public._bs_insert_bet(s.id, v_q, v_labels, v_item->>'tieRule', 'PLANNED', i);
  end loop;
  perform public._bs_log(s.id, public._bs_me_name() || ' created the series.');
  return s;
end $$;

drop function if exists public.create_series_bet(uuid, text);

/**
 * Host writes a bet: in the lobby, or while running when the series allows it (it opens
 * right away, which locks its outcomes). No outcomes = YES/NO.
 */
create function public.create_series_bet(p_series_id uuid, p_question text, p_outcomes text[] default null, p_tie_rule text default null)
returns public.series_bets language plpgsql security definer set search_path=public as $$
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
  b := public._bs_insert_bet(s.id, v_q, p_outcomes, p_tie_rule, case when s.status = 'LOBBY' then 'PLANNED' else 'OPEN' end, v_pos);
  if s.status = 'ACTIVE' then perform public._bs_log(s.id, 'New bet: ' || v_q); end if;
  return b;
end $$;

/**
 * Host edits a draft bet (it hasn't opened, so nobody has wagered): the question, the
 * kind, the outcomes and the tie rule. Null leaves that part as it is.
 *   p_kind: "binary" (YES/NO) or "multi".
 *   p_outcomes (multi): [{ id?, label }] in the new order. Listed ids keep their id
 *   (a rename or a move); ids left out are removed; entries without an id are added.
 * Once the bet opens its outcomes are locked: this fails with outcomes_locked.
 */
create or replace function public.update_series_bet(
  p_series_id uuid, p_bet_id uuid, p_question text default null, p_kind text default null,
  p_outcomes jsonb default null, p_tie_rule text default null
) returns public.series_bets language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; v_q text; v_kind text; v_labels text[]; v_ids uuid[]; v_item jsonb; v_id uuid; i int;
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

  v_kind := upper(coalesce(nullif(trim(p_kind), ''), case when p_outcomes is not null then 'MULTI' else b.kind end));
  if v_kind not in ('BINARY','MULTI') then perform public._bs_fail('invalid_outcomes', 'Pick YES/NO or multiple choice.'); end if;

  if v_kind = 'BINARY' then
    if b.kind <> 'BINARY' then
      delete from public.series_bet_outcomes where bet_id = b.id;
      insert into public.series_bet_outcomes(bet_id, label, position) values (b.id, 'YES', 1), (b.id, 'NO', 2);
    end if;
    update public.series_bets set kind = 'BINARY', tie_rule = 'REFUND' where id = b.id;
  else
    if p_outcomes is null and b.kind = 'BINARY' then
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
        if v_item->>'id' is not null then
          select o.id into v_id from public.series_bet_outcomes o where o.bet_id = b.id and o.id::text = lower(v_item->>'id');
          if v_id is null then perform public._bs_fail('invalid_outcomes', 'One of those outcomes isn''t on this bet.'); end if;
          if v_id = any(v_ids) then perform public._bs_fail('invalid_outcomes', 'An outcome is listed twice.'); end if;
        end if;
        v_labels := v_labels || coalesce(v_item->>'label', '');
        v_ids := v_ids || v_id;
      end loop;
      v_labels := public._bs_clean_outcomes(v_labels);
      -- Nobody can have wagered on a draft bet, so removing outcomes is safe.
      delete from public.series_bet_outcomes where bet_id = b.id and not (id = any(array_remove(v_ids, null)));
      -- Park kept rows on temporary names and positions so swaps and renames can't collide.
      update public.series_bet_outcomes set label = id::text, position = position + 1000 where bet_id = b.id;
      for i in 1..array_length(v_labels, 1) loop
        if v_ids[i] is null then
          insert into public.series_bet_outcomes(bet_id, label, position) values (b.id, v_labels[i], i);
        else
          update public.series_bet_outcomes set label = v_labels[i], position = i where id = v_ids[i];
        end if;
      end loop;
    end if;
    update public.series_bets set kind = 'MULTI',
      tie_rule = case when p_tie_rule is not null or b.kind = 'BINARY' then public._bs_tie_rule(p_tie_rule) else b.tie_rule end
    where id = b.id;
  end if;

  select * into b from public.series_bets where id = b.id;
  return b;
end $$;

-- ---------- betting ----------

/** Put coins on one of a bet's outcomes (by id, or by label like "YES"). Add to your outcome; never switch. */
create or replace function public.place_series_wager(p_series_id uuid, p_bet_id uuid, p_outcome text, p_amount bigint) returns public.series_wagers
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; p public.bet_series_participants; w public.series_wagers;
  o public.series_bet_outcomes; v_prior uuid; v_window boolean;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  select * into p from public.bet_series_participants where series_id = s.id and user_id = auth.uid() for update;
  if not found then perform public._bs_fail('not_member', 'You''re not in this series.'); end if;
  if not p.plays then perform public._bs_fail('not_player', 'You''re hosting without playing, so you can''t bet.'); end if;
  if s.status <> 'ACTIVE' then
    perform public._bs_fail('series_not_active', case when s.status = 'LOBBY' then 'Betting hasn''t started yet.' else 'This series is over.' end);
  end if;
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status <> 'OPEN' then
    perform public._bs_fail('bet_not_open', case when b.status = 'LOCKED' then 'Betting is closed on this one.' else 'This bet is finished.' end);
  end if;
  o := public._bs_outcome(b.id, p_outcome);
  if o.id is null then
    perform public._bs_fail('invalid_wager', case when b.kind = 'BINARY' then 'Pick YES or NO.' else 'Pick one of this bet''s outcomes.' end);
  end if;
  if p_amount is null or p_amount < 1 then perform public._bs_fail('invalid_wager', 'Wager at least 1 coin.'); end if;
  select outcome_id into v_prior from public.series_wagers where bet_id = b.id and user_id = auth.uid() limit 1;
  if v_prior is not null and v_prior <> o.id then
    v_window := s.withdraw_minutes > 0 and now() < b.opened_at + make_interval(mins => s.withdraw_minutes);
    perform public._bs_fail('cannot_switch_sides', format('You''re on %s. You can add to it%s.', public._bs_label(v_prior), case when v_window then ', or withdraw and pick again' else '' end));
  end if;
  if p.balance < p_amount then perform public._bs_fail('insufficient_balance', 'You only have ' || public._bs_coins(p.balance) || ' coins free.'); end if;
  update public.bet_series_participants set balance = balance - p_amount where series_id = s.id and user_id = auth.uid();
  insert into public.series_wagers(bet_id, user_id, outcome, outcome_id, amount) values (b.id, auth.uid(), o.label, o.id, p_amount) returning * into w;
  perform public._bs_log(s.id, p.display_name || case when v_prior is null then ' put ' else ' added ' end
    || public._bs_coins(p_amount) || ' on ' || o.label || ': ' || b.question);
  return w;
end $$;

/** Stop new wagers. If every coin is on one outcome there's nothing to win, so it refunds right away. */
create or replace function public.lock_series_bet(p_series_id uuid, p_bet_id uuid) returns public.series_bets
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; v_sides int;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  if s.status <> 'ACTIVE' then perform public._bs_fail('series_not_active', 'The series isn''t running.'); end if;
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status = 'LOCKED' then perform public._bs_fail('bet_not_open', 'Betting is already closed.'); end if;
  if b.status <> 'OPEN' then perform public._bs_fail('bet_not_open', 'This bet is already finished.'); end if;
  update public.series_bets set status = 'LOCKED', closed_at = now() where id = b.id;
  perform public._bs_log(s.id, 'Betting closed: ' || b.question);
  select count(distinct outcome_id) into v_sides from public.series_wagers where bet_id = b.id;
  if v_sides = 1 then perform public._bs_settle(s.id, b.id, null, false); end if;
  select * into b from public.series_bets where id = p_bet_id;
  return b;
end $$;

drop function if exists public.finish_series_bet(uuid, uuid, text, boolean);

/**
 * Resolve (p_cancel = false) or cancel (true) an open or locked bet. Settles exactly once.
 *   p_outcome: the winning outcome, by id or label.
 *   p_tied: instead of p_outcome, the outcomes that tied (2 or more, multiple-choice bets
 *   only). The bet's tie rule, fixed before betting, decides: REFUND gives everyone their
 *   coins back; FIRST_LISTED makes the earliest-listed tied outcome the winner.
 */
create function public.finish_series_bet(p_series_id uuid, p_bet_id uuid, p_outcome text, p_cancel boolean default false, p_tied text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.bet_series; b public.series_bets; o public.series_bet_outcomes; v_tied uuid[] := '{}'; v_ref text; v_winner uuid;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  if s.status <> 'ACTIVE' then perform public._bs_fail('series_not_active', 'The series isn''t running.'); end if;
  select * into b from public.series_bets where id = p_bet_id and series_id = s.id for update;
  if not found then perform public._bs_fail('bet_not_found', 'That bet doesn''t exist.'); end if;
  if b.status not in ('OPEN','LOCKED') then perform public._bs_fail('bet_not_open', 'This bet is already finished.'); end if;
  if coalesce(p_cancel, false) then return public._bs_settle(s.id, b.id, null, true); end if;

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

-- ---------- one read for the app ----------

/** A series the way the app shows it (camelCase, lowercase states), with standings and start blockers. */
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
        'status', case b.status when 'PLANNED' then 'draft' when 'OPEN' then 'open' when 'LOCKED' then 'closed'
          when 'RESOLVED' then 'resolved' else 'canceled' end,
        'openedAt', public._bs_iso(b.opened_at), 'closedAt', public._bs_iso(b.closed_at), 'settledAt', public._bs_iso(b.settled_at),
        'outcomes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', o.id, 'label', o.label, 'position', o.position,
            'pool', (select coalesce(sum(w.amount), 0) from public.series_wagers w where w.outcome_id = o.id),
            'backers', (select count(distinct w.user_id) from public.series_wagers w where w.outcome_id = o.id)
          ) order by o.position), '[]'::jsonb)
          from public.series_bet_outcomes o where o.bet_id = b.id),
        -- `outcome` keeps the old lowercase label ("yes"/"no") for older clients; use outcomeId.
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
  public._bs_clean_outcomes(text[]), public._bs_tie_rule(text), public._bs_insert_bet(uuid, text, text[], text, text, int),
  public._bs_outcome(uuid, text), public._bs_label(uuid), public._bs_settle(uuid, uuid, uuid, boolean, uuid[]), public._bs_series_json(uuid)
from public, anon, authenticated;

revoke all on function
  public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb, jsonb),
  public.create_series_bet(uuid, text, text[], text), public.update_series_bet(uuid, uuid, text, text, jsonb, text),
  public.place_series_wager(uuid, uuid, text, bigint), public.lock_series_bet(uuid, uuid),
  public.finish_series_bet(uuid, uuid, text, boolean, text[])
from public, anon;

grant execute on function
  public.create_bet_series(text, text, integer, bigint, integer, text, text[], jsonb, jsonb),
  public.create_series_bet(uuid, text, text[], text), public.update_series_bet(uuid, uuid, text, text, jsonb, text),
  public.place_series_wager(uuid, uuid, text, bigint), public.lock_series_bet(uuid, uuid),
  public.finish_series_bet(uuid, uuid, text, boolean, text[])
to authenticated;
