-- Fixes from an adversarial review.
--
-- 1. Linking an app account that another player already has no longer deletes
--    their link and proof. It's refused instead; they have to unlink it first.
--    (Before, linking someone else's public GitHub username, or calling the RPC
--    with a known Strava athlete id, silently took the account over.)
-- 2. The clan board and clan pages add up each player's wagered coins once per
--    request, instead of once per member per clan (and twice more for sorting).
--    Results are the same.

-- ---------- 1. one app account, one player, no takeovers ----------

create or replace function public.link_save_connection(
  p_provider text, p_external_id text, p_display_name text,
  p_access_token text, p_refresh_token text, p_expires_at timestamptz, p_scope text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  perform public._link_check_provider(p_provider);
  if coalesce(trim(p_external_id), '') = '' then perform public._bs_fail('link_failed', 'That app didn''t say which account this is.'); end if;
  if exists (select 1 from public.linked_accounts where provider = p_provider and external_id = p_external_id and user_id <> auth.uid()) then
    perform public._bs_fail('link_taken', 'That account is already linked to another player. They need to unlink it first.');
  end if;
  -- Linking a different account on the same app starts its proof fresh.
  delete from public.proof_items i using public.linked_accounts a
  where a.user_id = auth.uid() and a.provider = p_provider and a.external_id <> p_external_id
    and i.user_id = a.user_id and i.provider = a.provider;
  insert into public.linked_accounts(user_id, provider, external_id, display_name, access_token, refresh_token, expires_at, scope)
  values (auth.uid(), p_provider, p_external_id, left(p_display_name, 80), p_access_token, p_refresh_token, p_expires_at, p_scope)
  on conflict (user_id, provider) do update set
    external_id = excluded.external_id, display_name = excluded.display_name, access_token = excluded.access_token,
    refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, scope = excluded.scope,
    connected_at = case when public.linked_accounts.external_id = excluded.external_id then public.linked_accounts.connected_at else now() end,
    last_synced_at = case when public.linked_accounts.external_id = excluded.external_id then public.linked_accounts.last_synced_at end;
end $$;

-- ---------- 2. add up wagers once ----------

/** Coins wagered (not counting cancelled bets) by everyone in any clan, one row per player. */
create or replace function public._soc_wagered_by_member() returns table(user_id uuid, wagered bigint)
language sql stable set search_path=public as $$
  select w.user_id, sum(w.amount)::bigint
  from public.series_wagers w join public.series_bets b on b.id = w.bet_id
  where b.status <> 'CANCELLED' and w.user_id in (select m.user_id from public.clan_members m)
  group by w.user_id
$$;

create or replace function public._soc_clan_json(p_clan_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  with mem as (
    select m.user_id, m.joined_at, p, coalesce(public._soc_wagered(m.user_id), 0) as wagered
    from public.clan_members m join public.player_profiles p on p.user_id = m.user_id
    where m.clan_id = p_clan_id
  )
  select jsonb_build_object(
    'id', k.id, 'name', k.name, 'code', k.code, 'ownerId', k.owner_id, 'createdAt', k.created_at,
    'members', (
      select coalesce(jsonb_agg(public._soc_person(mem.p) || jsonb_build_object('wagered', mem.wagered, 'joinedAt', mem.joined_at)
        order by mem.wagered desc, mem.joined_at), '[]'::jsonb)
      from mem
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

  with w as (select * from public._soc_wagered_by_member()),
  scored as (
    select k.id, k.name, k.created_at, count(m.user_id)::int as members,
      coalesce(sum(w.wagered), 0)::bigint as wagered
    from public.clans k join public.clan_members m on m.clan_id = k.id
    left join w on w.user_id = m.user_id
    group by k.id
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

revoke all on function public._soc_wagered_by_member() from public, anon, authenticated;
