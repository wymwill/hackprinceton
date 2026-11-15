-- Interactive replies should not wait behind alerts for unrelated conversations.
drop function public.photon_claim(text);
create function public.photon_claim(p_project text, p_space text default null)
returns table(id uuid,lease uuid,space_id text,body text)
language sql security definer set search_path=public as $$
 with picked as (
  select o.id from public.photon_outbox o join public.photon_connections c on c.id=o.connection_id
  where c.project_id=p_project and (p_space is null or c.space_id=p_space)
   and o.sent_at is null and o.available_at<=now() and o.attempts<10
   and (o.kind<>'result' or c.alerts)
  order by (o.kind='reply') desc, o.created_at, o.id
  for update of o skip locked limit 10
 ), leased as (
  update public.photon_outbox o set lease=gen_random_uuid(),available_at=now()+interval '2 minutes',attempts=attempts+1
  from picked where picked.id=o.id returning o.*
 ) select l.id,l.lease,c.space_id,l.body from leased l
 join public.photon_connections c on c.id=l.connection_id
$$;
revoke all on function public.photon_claim(text,text) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.photon_claim(text,text) to service_role;
 end if;
end $$;
