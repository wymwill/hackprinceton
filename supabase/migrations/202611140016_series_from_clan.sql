-- Start a Bet Series with a whole clan: the host adds every member of one of
-- their clans to the series lobby in one step. Members still add their own
-- punishments and say they're ready before anything starts, and anyone can
-- leave the lobby, so nothing is decided for them. Adding twice is harmless.

create or replace function public.add_clan_to_series(p_series_id uuid, p_clan_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare s public.bet_series; c public.clans; v_added integer;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  select * into s from public.bet_series where id = p_series_id for update;
  if not found then perform public._bs_fail('series_not_found', 'That series doesn''t exist.'); end if;
  if s.host_user_id <> auth.uid() then perform public._bs_fail('not_host', 'Only the host can do that.'); end if;
  if s.status <> 'LOBBY' then perform public._bs_fail('series_not_lobby', 'Players can only be added before betting starts.'); end if;
  select * into c from public.clans where id = p_clan_id;
  if not found or not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    perform public._bs_fail('not_clan_member', 'You can only add a clan you''re in.');
  end if;

  insert into public.bet_series_participants(series_id, user_id, display_name, avatar_url)
  select s.id, m.user_id, left(coalesce(nullif(trim(p.display_name), ''), 'Player'), 40), p.avatar_url
  from public.clan_members m
  left join public.player_profiles p on p.user_id = m.user_id
  where m.clan_id = p_clan_id
    and not exists (select 1 from public.bet_series_participants x where x.series_id = s.id and x.user_id = m.user_id)
  order by m.joined_at, m.user_id;
  get diagnostics v_added = row_count;

  if v_added > 0 then
    perform public._bs_log(s.id, public._bs_name(s.id, auth.uid()) || ' added ' || v_added || ' player' ||
      case when v_added = 1 then '' else 's' end || ' from ' || c.name || '.');
  end if;
  return v_added;
end $$;

revoke all on function public.add_clan_to_series(uuid, uuid) from public, anon;
grant execute on function public.add_clan_to_series(uuid, uuid) to authenticated;
