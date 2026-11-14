create or replace function public.remove_series_participant(p_series_id uuid,p_user_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$ declare s public.bet_series; begin
 select * into s from public.bet_series where id=p_series_id for update;
 if s.id is null then raise exception 'series_not_found'; end if;
 if s.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 if s.status<>'LOBBY' then raise exception 'series_not_lobby'; end if;
 if p_user_id=s.host_user_id then raise exception 'cannot_remove_host'; end if;
 delete from public.bet_series_participants where series_id=s.id and user_id=p_user_id;
 return found;
end $$;
revoke all on function public.remove_series_participant(uuid,uuid) from public,anon;
grant execute on function public.remove_series_participant(uuid,uuid) to authenticated;
