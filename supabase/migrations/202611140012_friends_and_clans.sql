-- Friends and clans.
--
-- Friends: everyone gets a friend code (8 letters/digits). Adding someone by
-- their code (typed, scanned from a QR code, or opened from a shared link)
-- makes you friends both ways.
--
-- Clans: anyone can start one; others join with its code. You're in at most
-- one clan at a time. Clans are ranked by coins wagered: every coin members
-- have put on bets in any series, win or lose, except bets that were cancelled.
--
-- Like the Bet Series rules, the tables have row-level security with no
-- policies, so the only way in is through the security-definer functions here.

-- ---------- tables ----------

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  friend_code text not null unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_user_b on public.friendships(user_b);

create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  code text not null unique,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.clan_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clan_id uuid not null references public.clans(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists clan_members_clan on public.clan_members(clan_id);

alter table public.player_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;

-- ---------- helpers ----------

/** A fresh 8-character code with no look-alike letters, unique across friend and clan codes. */
create or replace function public._soc_new_code() returns text language plpgsql volatile set search_path=public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    exit when not exists (select 1 from public.player_profiles where friend_code = c)
      and not exists (select 1 from public.clans where code = c);
  end loop;
  return c;
end $$;

/** "abcd-efgh" or "ABCD EFGH" → "ABCDEFGH". */
create or replace function public._soc_clean_code(p text) returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

/** Your profile, created on first use and refreshed from your sign-in (name and picture). */
create or replace function public._soc_me() returns public.player_profiles
language plpgsql security definer set search_path=public as $$
declare p public.player_profiles;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  insert into public.player_profiles(user_id, display_name, avatar_url, friend_code)
  values (auth.uid(), public._bs_me_name(), public._bs_me_avatar(), public._soc_new_code())
  on conflict (user_id) do update
    set display_name = excluded.display_name, avatar_url = excluded.avatar_url, updated_at = now()
  returning * into p;
  return p;
end $$;

/** Coins a player has put on bets that weren't cancelled. */
create or replace function public._soc_wagered(p_user uuid) returns bigint language sql stable set search_path=public as $$
  select coalesce(sum(w.amount), 0)::bigint
  from public.series_wagers w join public.series_bets b on b.id = w.bet_id
  where w.user_id = p_user and b.status <> 'CANCELLED'
$$;

create or replace function public._soc_person(p public.player_profiles) returns jsonb language sql stable as $$
  select jsonb_build_object('id', p.user_id, 'name', p.display_name, 'avatarUrl', p.avatar_url)
$$;

-- ---------- friends ----------

/** Add a friend by their code. Adding someone twice is harmless. */
create or replace function public.add_friend(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles; them public.player_profiles;
begin
  me := public._soc_me();
  select * into them from public.player_profiles where friend_code = public._soc_clean_code(p_code);
  if not found then perform public._bs_fail('friend_not_found', 'No one has that friend code. Check it and try again.'); end if;
  if them.user_id = me.user_id then perform public._bs_fail('friend_self', 'That''s your own code.'); end if;
  insert into public.friendships(user_a, user_b)
  values (least(me.user_id, them.user_id), greatest(me.user_id, them.user_id))
  on conflict do nothing;
  return public._soc_person(them);
end $$;

create or replace function public.remove_friend(p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform public._soc_me();
  delete from public.friendships
  where user_a = least(auth.uid(), p_user_id) and user_b = greatest(auth.uid(), p_user_id);
end $$;

-- ---------- clans ----------

create or replace function public.create_clan(p_name text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.clans;
begin
  perform public._soc_me();
  if exists (select 1 from public.clan_members where user_id = auth.uid()) then
    perform public._bs_fail('already_in_clan', 'Leave your clan before starting a new one.');
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 then
    perform public._bs_fail('invalid_clan_name', 'Give the clan a name (up to 40 characters).');
  end if;
  insert into public.clans(name, code, owner_id) values (trim(p_name), public._soc_new_code(), auth.uid()) returning * into c;
  insert into public.clan_members(user_id, clan_id) values (auth.uid(), c.id);
  return jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code);
end $$;

/** Join a clan by its code. Joining your own clan again is harmless; you must leave another one first. */
create or replace function public.join_clan(p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c public.clans; mine uuid;
begin
  perform public._soc_me();
  select * into c from public.clans where code = public._soc_clean_code(p_code);
  if not found then perform public._bs_fail('clan_not_found', 'No clan has that code. Check it and try again.'); end if;
  select clan_id into mine from public.clan_members where user_id = auth.uid();
  if mine = c.id then return jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code); end if;
  if mine is not null then perform public._bs_fail('already_in_clan', 'Leave your clan before joining another.'); end if;
  insert into public.clan_members(user_id, clan_id) values (auth.uid(), c.id);
  return jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code);
end $$;

/** Leave your clan. The last one out closes it; if the owner leaves, the longest-standing member takes over. */
create or replace function public.leave_clan() returns void
language plpgsql security definer set search_path=public as $$
declare c public.clans; heir uuid;
begin
  perform public._soc_me();
  select k.* into c from public.clans k join public.clan_members m on m.clan_id = k.id where m.user_id = auth.uid() for update of k;
  if not found then perform public._bs_fail('not_in_clan', 'You''re not in a clan.'); end if;
  delete from public.clan_members where user_id = auth.uid();
  select user_id into heir from public.clan_members where clan_id = c.id order by joined_at, user_id limit 1;
  if heir is null then
    delete from public.clans where id = c.id;
  elsif c.owner_id = auth.uid() then
    update public.clans set owner_id = heir where id = c.id;
  end if;
end $$;

-- ---------- everything the Friends and Clans screens show ----------

create or replace function public.my_social_state() returns jsonb
language plpgsql security definer set search_path=public as $$
declare me public.player_profiles; my_clan uuid; board jsonb; clan jsonb;
begin
  me := public._soc_me();
  select clan_id into my_clan from public.clan_members where user_id = me.user_id;

  -- Every clan with its score, best first (ties: the older clan).
  with scored as (
    select k.id, k.name, k.created_at,
      count(m.user_id)::int as members,
      coalesce(sum(public._soc_wagered(m.user_id)), 0)::bigint as wagered
    from public.clans k join public.clan_members m on m.clan_id = k.id
    group by k.id
  ), ranked as (
    select *, rank() over (order by wagered desc, created_at) as rank from scored
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'rank', r.rank, 'id', r.id, 'name', r.name, 'members', r.members, 'wagered', r.wagered, 'mine', r.id = my_clan
    ) order by r.rank, r.created_at), '[]'::jsonb)
  into board
  from ranked r
  where r.rank <= 50 or r.id = my_clan;

  if my_clan is not null then
    select jsonb_build_object(
      'id', k.id, 'name', k.name, 'code', k.code, 'ownerId', k.owner_id, 'createdAt', k.created_at,
      'members', (
        select coalesce(jsonb_agg(public._soc_person(p) || jsonb_build_object('wagered', public._soc_wagered(m.user_id), 'joinedAt', m.joined_at)
          order by public._soc_wagered(m.user_id) desc, m.joined_at), '[]'::jsonb)
        from public.clan_members m join public.player_profiles p on p.user_id = m.user_id
        where m.clan_id = k.id
      )
    ) into clan
    from public.clans k where k.id = my_clan;
  end if;

  return jsonb_build_object(
    'me', public._soc_person(me) || jsonb_build_object('friendCode', me.friend_code, 'wagered', public._soc_wagered(me.user_id)),
    'friends', (
      select coalesce(jsonb_agg(public._soc_person(p) || jsonb_build_object('since', f.created_at) order by lower(p.display_name)), '[]'::jsonb)
      from public.friendships f
      join public.player_profiles p on p.user_id = case when f.user_a = me.user_id then f.user_b else f.user_a end
      where me.user_id in (f.user_a, f.user_b)
    ),
    'clan', clan,
    'clanBoard', board
  );
end $$;

-- ---------- permissions ----------

revoke all on table public.player_profiles, public.friendships, public.clans, public.clan_members from anon, authenticated;

revoke all on function
  public._soc_new_code(), public._soc_clean_code(text), public._soc_me(), public._soc_wagered(uuid), public._soc_person(public.player_profiles)
from public, anon, authenticated;

revoke all on function
  public.add_friend(text), public.remove_friend(uuid), public.create_clan(text), public.join_clan(text), public.leave_clan(), public.my_social_state()
from public, anon;

grant execute on function
  public.add_friend(text), public.remove_friend(uuid), public.create_clan(text), public.join_clan(text), public.leave_clan(), public.my_social_state()
to authenticated;
