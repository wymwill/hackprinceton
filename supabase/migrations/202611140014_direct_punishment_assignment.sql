-- A punishment agreed to before the series starts is owed when the winner picks it.
-- Existing pending picks become owed too; no second acceptance is required.
update public.series_favor_assignments
set status = 'CONSENTED', responded_at = now()
where status = 'PENDING_CONSENT';

create or replace function public.assign_series_favor(p_series_id uuid, p_loser_id uuid, p_favor_id uuid)
returns public.series_favor_assignments
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; a public.series_favor_assignments; f public.series_favors; v_waiting uuid;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found or not public.is_bet_series_member(p_series_id, auth.uid()) then
    perform public._bs_fail('series_not_found', 'That series doesn''t exist.');
  end if;
  if s.stake_mode <> 'SHARED_FAVOR_POOL' then perform public._bs_fail('wrong_mode', 'Punishments aren''t picked in this mode.'); end if;
  if s.status <> 'COMPLETED' then perform public._bs_fail('series_not_complete', 'Punishments are picked once the series ends.'); end if;
  select * into a from public.series_favor_assignments where series_id = s.id and loser_id = p_loser_id for update;
  if not found then perform public._bs_fail('not_loser', 'That player doesn''t owe a punishment.'); end if;
  if a.winner_id is distinct from auth.uid() then perform public._bs_fail('not_winner', public._bs_name(s.id, a.winner_id) || ' picks this punishment.'); end if;
  if a.status in ('PENDING_CONSENT','CONSENTED') then perform public._bs_fail('already_picked', 'You already picked.'); end if;
  select * into f from public.series_favors where id = p_favor_id and series_id = s.id and not withdrawn;
  if not found then perform public._bs_fail('favor_not_found', 'That punishment isn''t in the pool.'); end if;
  if f.submitted_by <> p_loser_id and not (p_loser_id = any(f.consented_by)) then
    perform public._bs_fail('favor_lacks_consent', public._bs_name(s.id, p_loser_id) || ' hasn''t agreed to that punishment.');
  end if;
  if s.exclusive_pool then
    select winner_id into v_waiting from public.series_favor_assignments
    where series_id = s.id and position < a.position and status = 'PICKING' order by position limit 1;
    if v_waiting is not null then perform public._bs_fail('picks_in_order', public._bs_name(s.id, v_waiting) || ' picks first.'); end if;
    if exists (select 1 from public.series_favor_assignments
      where series_id = s.id and favor_id = f.id and id <> a.id and status in ('PENDING_CONSENT','CONSENTED')) then
      perform public._bs_fail('favor_taken', 'Someone already picked that punishment.');
    end if;
  end if;
  update public.series_favor_assignments set favor_id = f.id, text = f.description, status = 'CONSENTED', responded_at = now()
  where id = a.id returning * into a;
  perform public._bs_log(s.id, public._bs_name(s.id, auth.uid()) || ' picked a punishment for ' || public._bs_name(s.id, p_loser_id) || '.');
  return a;
end $$;

revoke execute on function public.respond_series_favor_assignment(uuid, boolean) from authenticated;
