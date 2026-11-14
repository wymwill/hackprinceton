-- Bet Series: changing a pledged favor resets everyone's "ready".
--
-- Before: in pledge mode, pledging, replacing or withdrawing a pledge only un-readied
-- the person who changed it. Everyone else stayed ready, so a player could swap their
-- pledge for something else at the last minute and the host could start without anyone
-- seeing the new stakes. Now any pledge change un-readies every player, the same as a
-- change to a shared pool already did, and the activity feed says why.

/** Add a favor (shared pool) or set your pledge (pledge mode, replacing any earlier one). Lobby only. */
create or replace function public.propose_series_favor(p_series_id uuid, p_description text) returns public.series_favors
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; p public.bet_series_participants; f public.series_favors; v_text text; v_count int; v_replaced boolean;
begin
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  select * into p from public.bet_series_participants where series_id = s.id and user_id = auth.uid();
  if not found then perform public._bs_fail('not_member', 'You''re not in this series.'); end if;
  if s.status <> 'LOBBY' then perform public._bs_fail('favor_proposals_closed', 'Favors are locked once betting starts.'); end if;
  if not p.plays then perform public._bs_fail('not_player', 'You''re hosting without playing, so you don''t add favors.'); end if;
  if s.stake_mode = 'MONEY' then perform public._bs_fail('wrong_mode', 'This series uses real money, not favors.'); end if;
  v_text := regexp_replace(trim(coalesce(p_description, '')), '\s+', ' ', 'g');
  if char_length(v_text) not between 3 and 120 then perform public._bs_fail('invalid_favor', 'Describe the favor in a few words (3 to 120 characters).'); end if;
  if s.stake_mode = 'PLEDGE' then
    update public.series_favors set withdrawn = true where series_id = s.id and submitted_by = auth.uid() and not withdrawn;
    v_replaced := found;
  else
    select count(*) into v_count from public.series_favors where series_id = s.id and submitted_by = auth.uid() and not withdrawn;
    if v_count >= s.favors_per_player then
      perform public._bs_fail('favor_limit', format('You can add up to %s favor%s.', s.favors_per_player, case when s.favors_per_player = 1 then '' else 's' end));
    end if;
  end if;
  -- The stakes changed, so everyone has to look again and say they're ready.
  update public.bet_series_participants set ready = false where series_id = s.id;
  insert into public.series_favors(series_id, submitted_by, description) values (s.id, auth.uid(), v_text) returning * into f;
  perform public._bs_log(s.id, p.display_name || case
    when s.stake_mode = 'SHARED_FAVOR_POOL' then ' added a favor to the pool. Everyone needs to say ready again.'
    when v_replaced then ' changed their pledge to "' || v_text || '". Everyone needs to say ready again.'
    else ' pledged "' || v_text || '". Everyone needs to say ready again.' end);
  return f;
end $$;

/** Take back your own favor or pledge. Lobby only. Everyone has to say ready again. */
create or replace function public.withdraw_series_favor(p_favor_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare f public.series_favors; s public.bet_series;
begin
  select * into f from public.series_favors where id = p_favor_id and not withdrawn;
  if not found or not public.is_bet_series_member(f.series_id, auth.uid()) then perform public._bs_fail('favor_not_found', 'That favor doesn''t exist.'); end if;
  select * into s from public.bet_series where id = f.series_id for update;
  if s.status <> 'LOBBY' then perform public._bs_fail('favor_proposals_closed', 'Favors are locked once betting starts.'); end if;
  if f.submitted_by <> auth.uid() then perform public._bs_fail('not_author', 'You can only remove your own favors.'); end if;
  update public.series_favors set withdrawn = true where id = f.id;
  update public.bet_series_participants set ready = false where series_id = s.id;
  perform public._bs_log(s.id, public._bs_name(s.id, auth.uid()) || case when s.stake_mode = 'PLEDGE'
    then ' took back their pledge. Everyone needs to say ready again.'
    else ' took a favor out of the pool. Everyone needs to say ready again.' end);
  return true;
end $$;
