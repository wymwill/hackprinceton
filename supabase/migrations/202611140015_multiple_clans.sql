-- A player can belong to several clans. Membership and chat read state are per clan.
alter table public.clan_members drop constraint clan_members_pkey;
alter table public.clan_members add constraint clan_members_pkey primary key (user_id, clan_id);

create or replace function public.create_clan(p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.clans;
begin
  perform public._soc_me();
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    perform public._bs_fail('invalid_clan_name', 'Give the clan a name (up to 40 characters).');
  end if;
  insert into public.clans(name, code, owner_id) values (trim(p_name), public._soc_new_code(), auth.uid()) returning * into c;
  insert into public.clan_members(user_id, clan_id) values (auth.uid(), c.id);
  return jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code);
end $$;

create or replace function public.join_clan(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.clans;
begin
  perform public._soc_me();
  select * into c from public.clans where code = public._soc_clean_code(p_code);
  if not found then perform public._bs_fail('clan_not_found', 'No clan has that code. Check it and try again.'); end if;
  insert into public.clan_members(user_id, clan_id) values (auth.uid(), c.id) on conflict (user_id, clan_id) do nothing;
  return jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code);
end $$;

create or replace function public.leave_clan(p_clan_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c public.clans; heir uuid;
begin
  perform public._soc_me();
  select * into c from public.clans where id = p_clan_id for update;
  if not found or not exists (select 1 from public.clan_members where user_id = auth.uid() and clan_id = p_clan_id) then
    perform public._bs_fail('not_in_clan', 'You''re not in that clan.');
  end if;
  delete from public.clan_members where user_id = auth.uid() and clan_id = p_clan_id;
  select user_id into heir from public.clan_members where clan_id = p_clan_id order by joined_at, user_id limit 1;
  if heir is null then
    delete from public.clans where id = p_clan_id;
  elsif c.owner_id = auth.uid() then
    update public.clans set owner_id = heir where id = p_clan_id;
  end if;
end $$;

-- The old no-argument RPC remains safe for older clients with one membership.
create or replace function public.leave_clan() returns void
language plpgsql security definer set search_path=public as $$
declare v_clan uuid; v_count int;
begin
  select count(*) into v_count from public.clan_members where user_id = auth.uid();
  if v_count = 0 then perform public._bs_fail('not_in_clan', 'You''re not in a clan.'); end if;
  if v_count > 1 then perform public._bs_fail('choose_clan', 'Choose which clan to leave.'); end if;
  select clan_id into v_clan from public.clan_members where user_id = auth.uid();
  perform public.leave_clan(v_clan);
end $$;

create or replace function public._soc_clan_json(p_clan_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'id', k.id, 'name', k.name, 'code', k.code, 'ownerId', k.owner_id, 'createdAt', k.created_at,
    'members', (
      select coalesce(jsonb_agg(public._soc_person(p) || jsonb_build_object('wagered', public._soc_wagered(m.user_id), 'joinedAt', m.joined_at)
        order by public._soc_wagered(m.user_id) desc, m.joined_at), '[]'::jsonb)
      from public.clan_members m join public.player_profiles p on p.user_id = m.user_id where m.clan_id = k.id
    ))
  from public.clans k where k.id = p_clan_id and exists
    (select 1 from public.clan_members m where m.clan_id = k.id and m.user_id = auth.uid())
$$;

create or replace function public.my_social_state() returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles; board jsonb; my_clans jsonb;
begin
  me := public._soc_me();
  select coalesce(jsonb_agg(public._soc_clan_json(m.clan_id) order by m.joined_at, m.clan_id), '[]'::jsonb)
  into my_clans from public.clan_members m where m.user_id = me.user_id;

  with scored as (
    select k.id, k.name, k.created_at, count(m.user_id)::int as members,
      coalesce(sum(public._soc_wagered(m.user_id)), 0)::bigint as wagered
    from public.clans k join public.clan_members m on m.clan_id = k.id group by k.id
  ), ranked as (
    select *, rank() over (order by wagered desc, created_at) as rank from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', r.rank, 'id', r.id, 'name', r.name, 'members', r.members, 'wagered', r.wagered,
      'mine', exists (select 1 from public.clan_members m where m.user_id = me.user_id and m.clan_id = r.id)
    ) order by r.rank, r.created_at), '[]'::jsonb)
  into board from ranked r
  where r.rank <= 50 or exists (select 1 from public.clan_members m where m.user_id = me.user_id and m.clan_id = r.id);

  return jsonb_build_object(
    'me', public._soc_person(me) || jsonb_build_object('friendCode', me.friend_code, 'wagered', public._soc_wagered(me.user_id)),
    'friends', (
      select coalesce(jsonb_agg(public._soc_person(p) || jsonb_build_object('since', f.created_at) order by lower(p.display_name)), '[]'::jsonb)
      from public.friendships f join public.player_profiles p
        on p.user_id = case when f.user_a = me.user_id then f.user_b else f.user_a end
      where me.user_id in (f.user_a, f.user_b)
    ),
    'clans', my_clans,
    'clan', my_clans->0,
    'clanBoard', board
  );
end $$;

create or replace function public.clan_chat_status() returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'clanId', case when count(*) = 1 then min(m.clan_id::text) else null end,
    'lastId', case when count(*) = 1 then max(u.last_id) else null end,
    'unread', coalesce(sum(u.unread), 0))
  from public.clan_members m
  cross join lateral (
    select count(*) as unread,
      (select max(id) from public.clan_messages where clan_id = m.clan_id) as last_id
    from public.clan_messages c
    where c.clan_id = m.clan_id and c.id > m.last_read_id
      and c.user_id is distinct from auth.uid() and c.deleted_at is null
  ) u
  where m.user_id = auth.uid()
$$;

-- Read receipts must update only the chat whose messages were read or sent.
create or replace function public._chat_on_join() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_name text; v_founder boolean;
begin
  select coalesce((select display_name from public.player_profiles where user_id = new.user_id), 'Someone') into v_name;
  select owner_id = new.user_id into v_founder from public.clans where id = new.clan_id;
  update public.clan_members
    set last_read_id = coalesce((select max(id) from public.clan_messages where clan_id = new.clan_id), 0)
    where user_id = new.user_id and clan_id = new.clan_id;
  if v_founder and not exists (select 1 from public.clan_members where clan_id = new.clan_id and user_id <> new.user_id) then
    perform public._chat_system(new.clan_id, new.user_id, 'clan_created', v_name || ' started the clan.');
  else
    perform public._chat_system(new.clan_id, new.user_id, 'member_joined', v_name || ' joined the clan.');
  end if;
  return null;
end $$;

create or replace function public.send_clan_message(p_clan_id uuid, p_body text, p_client_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles; m public.clan_messages; v_body text;
begin
  perform public._chat_require(p_clan_id);
  if p_client_id is not null then
    select * into m from public.clan_messages where user_id = auth.uid() and client_id = p_client_id;
    if found then
      if m.clan_id <> p_clan_id then perform public._bs_fail('invalid_message', 'That message id was already used.'); end if;
      return public._chat_json(m);
    end if;
  end if;
  v_body := replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E'\r', E'\n');
  v_body := regexp_replace(v_body, '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]', '', 'g');
  v_body := regexp_replace(v_body, E'\n{4,}', E'\n\n\n', 'g');
  v_body := btrim(v_body, E' \t\n');
  if char_length(v_body) = 0 then perform public._bs_fail('invalid_message', 'Write something first.'); end if;
  if char_length(v_body) > 2000 then perform public._bs_fail('invalid_message', 'Keep messages under 2,000 characters.'); end if;
  if (select count(*) from public.clan_messages
      where user_id = auth.uid() and kind = 'text' and created_at > now() - interval '10 seconds') >= 10 then
    perform public._bs_fail('slow_down', 'You''re sending messages too fast. Wait a few seconds.');
  end if;
  me := public._soc_me();
  insert into public.clan_messages(clan_id, user_id, kind, body, author_name, author_avatar, client_id)
  values (p_clan_id, auth.uid(), 'text', v_body, me.display_name, me.avatar_url, p_client_id)
  returning * into m;
  update public.clan_members set last_read_id = greatest(last_read_id, m.id)
    where user_id = auth.uid() and clan_id = p_clan_id;
  return public._chat_json(m);
end $$;

create or replace function public.mark_clan_chat_read(p_clan_id uuid, p_message_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public._chat_require(p_clan_id);
  update public.clan_members
    set last_read_id = greatest(last_read_id, least(coalesce(p_message_id, 0),
      coalesce((select max(id) from public.clan_messages where clan_id = p_clan_id), 0)))
    where user_id = auth.uid() and clan_id = p_clan_id;
  return public.clan_chat_status();
end $$;

revoke all on function public._soc_clan_json(uuid) from public, anon, authenticated;
revoke all on function public.leave_clan(uuid) from public, anon;
grant execute on function public.leave_clan(uuid) to authenticated;
