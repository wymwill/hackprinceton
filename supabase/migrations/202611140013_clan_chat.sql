-- Clan chat: one persistent, private chat per clan.
--
-- Builds on 202611140012_friends_and_clans.sql without changing it. Every clan,
-- old or new, has a chat as soon as this runs: messages just point at the clan.
--
--   * Only current members can read a clan's messages, through the RLS policy
--     below (also what Supabase Realtime checks before delivering a change) or
--     the functions here. Leaving revokes access at once, because the policy
--     looks at membership on every read. New members see the whole history.
--   * Writes only go through security-definer functions. The sender is always
--     auth.uid(); nothing in a request picks who is speaking.
--   * Messages are soft-deleted by their author: the text is wiped and the row
--     stays as a "message deleted" marker, so clients that missed the change
--     can't keep showing the text.
--   * When a clan closes (its last member leaves), its messages are deleted with
--     it (on delete cascade). Nobody could read them any more.
--   * A client can send a client_id (a UUID it makes up) with each message.
--     Sending the same one again returns the first message instead of a copy,
--     so a retry after a dropped connection can't post twice.
--
-- System messages (kind 'system') record clan events. `event` names the event and
-- `data` holds its details. Today: clan_created, member_joined, member_left,
-- owner_changed. Bet-result announcements can later be another event (say
-- 'bet_result' with { seriesId, betId, ... } in data) with no schema change.

-- ---------- tables ----------

create table if not exists public.clan_messages (
  id bigint generated always as identity primary key,
  clan_id uuid not null references public.clans(id) on delete cascade,
  -- The sender, or for system messages the member the event is about.
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('text', 'system')),
  event text check (event is null or event ~ '^[a-z_]{1,40}$'),
  body text not null default '' check (char_length(body) <= 2000),
  data jsonb not null default '{}'::jsonb,
  -- The sender's name and picture when they sent it, so history reads right after they leave.
  author_name text not null default '',
  author_avatar text,
  client_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'text' or event is not null)
);
create index if not exists clan_messages_clan_id on public.clan_messages(clan_id, id desc);
create unique index if not exists clan_messages_client_id on public.clan_messages(user_id, client_id) where client_id is not null;

-- Where each member has read up to, for unread counts.
alter table public.clan_members add column if not exists last_read_id bigint not null default 0;

alter table public.clan_messages enable row level security;

/** Whether the signed-in player is in this clan right now. */
create or replace function public.is_clan_member(p_clan_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid())
$$;

drop policy if exists "clan members read their chat" on public.clan_messages;
create policy "clan members read their chat" on public.clan_messages
  for select to authenticated using (public.is_clan_member(clan_id));

revoke all on table public.clan_messages from anon, authenticated;
grant select on table public.clan_messages to authenticated;

-- Live delivery: Supabase Realtime streams changes to tables in this publication,
-- checking the policy above for each subscriber. Skipped where it doesn't exist (tests).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clan_messages') then
    alter publication supabase_realtime add table public.clan_messages;
  end if;
end $$;

-- ---------- helpers ----------

create or replace function public._chat_json(m public.clan_messages) returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object(
    'id', m.id, 'clanId', m.clan_id, 'userId', m.user_id, 'kind', m.kind, 'event', m.event,
    'body', m.body, 'data', m.data, 'authorName', m.author_name, 'authorAvatar', m.author_avatar,
    'clientId', m.client_id, 'createdAt', public._bs_iso(m.created_at), 'deleted', m.deleted_at is not null
  )
$$;

/** The caller's clan if it's this one; otherwise refuse without saying whether the clan exists. */
create or replace function public._chat_require(p_clan_id uuid) returns public.clan_members
language plpgsql stable set search_path=public as $$
declare m public.clan_members;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  select * into m from public.clan_members where user_id = auth.uid() and clan_id = p_clan_id;
  if not found then perform public._bs_fail('not_clan_member', 'Only members of this clan can see its chat.'); end if;
  return m;
end $$;

/** Write a system message about a member. Used by the triggers below. */
create or replace function public._chat_system(p_clan_id uuid, p_user_id uuid, p_event text, p_body text, p_data jsonb default '{}')
returns void language sql set search_path=public as $$
  insert into public.clan_messages(clan_id, user_id, kind, event, body, data, author_name, author_avatar)
  select p_clan_id, p_user_id, 'system', p_event, left(p_body, 2000), coalesce(p_data, '{}'),
    coalesce(p.display_name, 'Someone'), p.avatar_url
  from (select 1) one left join public.player_profiles p on p.user_id = p_user_id
$$;

-- ---------- system messages, from clan events ----------
-- Triggers catch every path (create, join, leave, a new owner), so the clan
-- functions in 0012 stay as they are.

create or replace function public._chat_on_join() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_name text; v_founder boolean;
begin
  select coalesce((select display_name from public.player_profiles where user_id = new.user_id), 'Someone') into v_name;
  select owner_id = new.user_id into v_founder from public.clans where id = new.clan_id;
  -- Start new members at the end of the history: they can scroll back through it, but it isn't "unread".
  update public.clan_members
    set last_read_id = coalesce((select max(id) from public.clan_messages where clan_id = new.clan_id), 0)
    where user_id = new.user_id;
  if v_founder and not exists (select 1 from public.clan_members where clan_id = new.clan_id and user_id <> new.user_id) then
    perform public._chat_system(new.clan_id, new.user_id, 'clan_created', v_name || ' started the clan.');
  else
    perform public._chat_system(new.clan_id, new.user_id, 'member_joined', v_name || ' joined the clan.');
  end if;
  return null;
end $$;

create or replace function public._chat_on_leave() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  -- When the clan itself is being deleted, there's no chat left to write to.
  if exists (select 1 from public.clans where id = old.clan_id) then
    perform public._chat_system(old.clan_id, old.user_id, 'member_left',
      coalesce((select display_name from public.player_profiles where user_id = old.user_id), 'Someone') || ' left the clan.');
  end if;
  return null;
end $$;

create or replace function public._chat_on_owner() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform public._chat_system(new.id, new.owner_id, 'owner_changed',
    coalesce((select display_name from public.player_profiles where user_id = new.owner_id), 'Someone') || ' is now the clan owner.',
    jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
  return null;
end $$;

drop trigger if exists clan_chat_join on public.clan_members;
create trigger clan_chat_join after insert on public.clan_members for each row execute function public._chat_on_join();
drop trigger if exists clan_chat_leave on public.clan_members;
create trigger clan_chat_leave after delete on public.clan_members for each row execute function public._chat_on_leave();
drop trigger if exists clan_chat_owner on public.clans;
create trigger clan_chat_owner after update of owner_id on public.clans
  for each row when (old.owner_id is distinct from new.owner_id) execute function public._chat_on_owner();

-- ---------- reading ----------

/**
 * One page of a clan's chat, oldest first. Newest page by default; p_before for
 * the page before a message (scrolling back); p_after for everything newer than
 * a message (catching up after a reconnect). At most 100 per page.
 */
create or replace function public.clan_messages_page(
  p_clan_id uuid, p_before bigint default null, p_after bigint default null, p_limit int default 50
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me public.clan_members; v_limit int := greatest(1, least(coalesce(p_limit, 50), 100)); v_rows public.clan_messages[]; v_more boolean;
begin
  me := public._chat_require(p_clan_id);
  if p_after is not null then
    select coalesce(array_agg(m order by m.id), '{}') into v_rows
    from (select * from public.clan_messages where clan_id = p_clan_id and id > p_after order by id limit v_limit + 1) m;
    v_more := coalesce(array_length(v_rows, 1), 0) > v_limit;
    if v_more then v_rows := v_rows[1:v_limit]; end if;
  else
    select coalesce(array_agg(m order by m.id), '{}') into v_rows
    from (select * from public.clan_messages where clan_id = p_clan_id and (p_before is null or id < p_before) order by id desc limit v_limit + 1) m;
    v_more := coalesce(array_length(v_rows, 1), 0) > v_limit;
    -- Sorted oldest first, so the extra row that says "there's more" is the first one.
    if v_more then v_rows := v_rows[2:v_limit + 1]; end if;
  end if;
  return jsonb_build_object(
    'messages', (select coalesce(jsonb_agg(public._chat_json(r) order by r.id), '[]'::jsonb) from unnest(v_rows) r),
    'hasMore', v_more,
    'lastReadId', me.last_read_id,
    'unread', (select count(*) from public.clan_messages
               where clan_id = p_clan_id and id > me.last_read_id and user_id is distinct from auth.uid() and deleted_at is null)
  );
end $$;

/** Your clan and how many of its messages you haven't read (for badges). */
create or replace function public.clan_chat_status() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce((
    select jsonb_build_object(
      'clanId', m.clan_id,
      'lastId', (select max(id) from public.clan_messages where clan_id = m.clan_id),
      'unread', (select count(*) from public.clan_messages c
                 where c.clan_id = m.clan_id and c.id > m.last_read_id and c.user_id is distinct from auth.uid() and c.deleted_at is null))
    from public.clan_members m where m.user_id = auth.uid()
  ), jsonb_build_object('clanId', null, 'lastId', null, 'unread', 0))
$$;

-- ---------- writing ----------

/**
 * Send a message to your clan as yourself. Text is trimmed, stray control
 * characters are dropped, long runs of blank lines are shortened, and it must
 * be 1 to 2000 characters. Repeating a client_id returns the first message.
 */
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
  -- What you send, you've read.
  update public.clan_members set last_read_id = greatest(last_read_id, m.id) where user_id = auth.uid();
  return public._chat_json(m);
end $$;

/** Delete one of your own messages. Its text is wiped; a "deleted" marker stays. Deleting twice is harmless. */
create or replace function public.delete_clan_message(p_message_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m public.clan_messages;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  select * into m from public.clan_messages where id = p_message_id for update;
  -- Same answer whether it doesn't exist or is in a clan you're not in.
  if not found or not public.is_clan_member(m.clan_id) then perform public._bs_fail('message_not_found', 'That message doesn''t exist.'); end if;
  if m.kind <> 'text' or m.user_id is distinct from auth.uid() then
    perform public._bs_fail('not_message_author', 'You can only delete your own messages.');
  end if;
  if m.deleted_at is null then
    update public.clan_messages set body = '', deleted_at = now() where id = m.id returning * into m;
  end if;
  return public._chat_json(m);
end $$;

/** Mark your clan's chat read up to a message. Never moves backwards. */
create or replace function public.mark_clan_chat_read(p_clan_id uuid, p_message_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public._chat_require(p_clan_id);
  update public.clan_members
    set last_read_id = greatest(last_read_id, least(coalesce(p_message_id, 0),
      coalesce((select max(id) from public.clan_messages where clan_id = p_clan_id), 0)))
    where user_id = auth.uid();
  return public.clan_chat_status();
end $$;

-- ---------- permissions ----------

revoke all on function
  public._chat_json(public.clan_messages), public._chat_require(uuid), public._chat_system(uuid, uuid, text, text, jsonb),
  public._chat_on_join(), public._chat_on_leave(), public._chat_on_owner()
from public, anon, authenticated;

revoke all on function
  public.is_clan_member(uuid), public.clan_messages_page(uuid, bigint, bigint, int), public.clan_chat_status(),
  public.send_clan_message(uuid, text, uuid), public.delete_clan_message(bigint), public.mark_clan_chat_read(uuid, bigint)
from public, anon;

grant execute on function
  public.is_clan_member(uuid), public.clan_messages_page(uuid, bigint, bigint, int), public.clan_chat_status(),
  public.send_clan_message(uuid, text, uuid), public.delete_clan_message(bigint), public.mark_clan_chat_read(uuid, bigint)
to authenticated;
