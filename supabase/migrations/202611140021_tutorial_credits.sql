-- Tutorial credits.
--
-- Finishing the basic tutorial (its quiz is checked here) gives 200 credits,
-- once per account. Credits wait on your profile until the next series you
-- play in starts; then they're added to your starting coins there and used up.
--
-- The bonus is applied by a trigger that runs at the end of the transaction
-- that moves a series from LOBBY to ACTIVE, after the start has set everyone's
-- starting balance. That keeps start_bet_series itself untouched.

alter table public.player_profiles
  add column if not exists credits integer not null default 0 check (credits >= 0),
  add column if not exists tutorial_done_at timestamptz;

alter table public.bet_series_participants
  add column if not exists bonus_coins integer not null default 0;

/** Your credits, and whether you've finished the tutorial. */
create or replace function public.my_credits() returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles;
begin
  me := public._soc_me();
  return jsonb_build_object('credits', me.credits, 'tutorialDoneAt', me.tutorial_done_at);
end $$;

/**
 * Finish the tutorial. p_answers holds the quiz: { payout, rules, bottom }.
 * Wrong answers are refused; the first correct finish gives 200 credits.
 */
create or replace function public.complete_tutorial(p_answers jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles; awarded integer := 0;
begin
  me := public._soc_me();
  if coalesce(p_answers->>'payout', '') <> 'split'
    or coalesce(p_answers->>'rules', '') <> 'lobby'
    or coalesce(p_answers->>'bottom', '') <> 'punishment' then
    perform public._bs_fail('quiz_wrong', 'Not quite. Check your answers and try again.');
  end if;
  if me.tutorial_done_at is null then
    awarded := 200;
    update public.player_profiles set credits = credits + awarded, tutorial_done_at = now()
    where user_id = me.user_id returning * into me;
  end if;
  return jsonb_build_object('credits', me.credits, 'awarded', awarded, 'tutorialDoneAt', me.tutorial_done_at);
end $$;

/** When a series starts, each player's credits become extra starting coins there. */
create or replace function public._tc_apply_credits() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
  for r in
    select p.user_id, pr.credits
    from public.bet_series_participants p
    join public.player_profiles pr on pr.user_id = p.user_id
    where p.series_id = new.id and p.plays and pr.credits > 0
    for update of pr
  loop
    update public.bet_series_participants
      set balance = balance + r.credits, bonus_coins = bonus_coins + r.credits
      where series_id = new.id and user_id = r.user_id;
    update public.player_profiles set credits = 0 where user_id = r.user_id;
    perform public._bs_log(new.id, public._bs_name(new.id, r.user_id) || ' started with ' || public._bs_coins(r.credits) || ' bonus coins from the tutorial.');
  end loop;
  return null;
end $$;

drop trigger if exists bet_series_apply_credits on public.bet_series;
create constraint trigger bet_series_apply_credits
  after update of status on public.bet_series
  deferrable initially deferred
  for each row
  when (old.status = 'LOBBY' and new.status = 'ACTIVE')
  execute function public._tc_apply_credits();

revoke all on function public._tc_apply_credits() from public, anon, authenticated;
revoke all on function public.my_credits(), public.complete_tutorial(jsonb) from public, anon;
grant execute on function public.my_credits(), public.complete_tutorial(jsonb) to authenticated;
