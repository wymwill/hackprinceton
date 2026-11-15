-- Linked accounts: Strava, Fitbit, Oura, Whoop, Spotify and GitHub as proof on bets.
--
-- Each player's own app does the work with their own sign-in: it trades an
-- OAuth code for tokens (or, for GitHub, just links a public username), stores
-- them here, and copies recent data in as "proof items" (a run, a day's steps,
-- a night's sleep, a song played, a push to GitHub…). No secret Supabase key.
--
-- Tokens are only ever returned to their owner. Proof items are readable only
-- by people who share a series with you, through link_proof_for. Like the other
-- rules, the tables have row-level security and no policies.

create table if not exists public.linked_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('strava', 'fitbit', 'oura', 'whoop', 'spotify', 'github')),
  external_id text not null,
  display_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  primary key (user_id, provider),
  unique (provider, external_id)
);

create table if not exists public.proof_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_id text not null,
  kind text not null check (char_length(kind) between 1 and 40),
  title text,
  value numeric not null default 0,
  unit text not null default '',
  started_at timestamptz not null,
  extras jsonb not null default '{}',
  primary key (user_id, provider, external_id)
);
create index if not exists proof_items_lookup on public.proof_items(user_id, started_at);

alter table public.linked_accounts enable row level security;
alter table public.proof_items enable row level security;

create or replace function public._link_check_provider(p text) returns void language plpgsql immutable as $$
begin
  if p is null or p not in ('strava', 'fitbit', 'oura', 'whoop', 'spotify', 'github') then
    perform public._bs_fail('unknown_provider', 'That app can''t be linked.');
  end if;
end $$;

/** Save (or replace) your link to an app. One account on an app belongs to one Alea account. */
create or replace function public.link_save_connection(
  p_provider text, p_external_id text, p_display_name text,
  p_access_token text, p_refresh_token text, p_expires_at timestamptz, p_scope text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  perform public._link_check_provider(p_provider);
  if coalesce(trim(p_external_id), '') = '' then perform public._bs_fail('link_failed', 'That app didn''t say which account this is.'); end if;
  -- Moving an app account to a new Alea account takes its old proof with it out.
  delete from public.proof_items i using public.linked_accounts a
  where a.provider = p_provider and a.external_id = p_external_id and a.user_id <> auth.uid()
    and i.user_id = a.user_id and i.provider = a.provider;
  delete from public.linked_accounts where provider = p_provider and external_id = p_external_id and user_id <> auth.uid();
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

/** Your own link to an app (with tokens), for the server to call it on your behalf. Null when not linked. */
create or replace function public.link_my_tokens(p_provider text) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('externalId', external_id, 'displayName', display_name, 'accessToken', access_token,
    'refreshToken', refresh_token, 'expiresAt', expires_at, 'lastSyncedAt', last_synced_at)
  from public.linked_accounts where user_id = auth.uid() and provider = p_provider
$$;

/** Store new tokens after a refresh. */
create or replace function public.link_update_tokens(p_provider text, p_access_token text, p_refresh_token text, p_expires_at timestamptz) returns void
language sql security definer set search_path=public as $$
  update public.linked_accounts
  set access_token = p_access_token, refresh_token = coalesce(p_refresh_token, refresh_token), expires_at = p_expires_at
  where user_id = auth.uid() and provider = p_provider
$$;

/**
 * Copy in proof: [{ id, kind, title, value, unit, startedAt, extras }]. Later copies
 * of the same id replace earlier ones. Returns how many were new or changed.
 */
create or replace function public.link_save_items(p_provider text, p_rows jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if not exists (select 1 from public.linked_accounts where user_id = auth.uid() and provider = p_provider) then
    perform public._bs_fail('link_not_connected', 'Link that app first.');
  end if;
  insert into public.proof_items(user_id, provider, external_id, kind, title, value, unit, started_at, extras)
  select auth.uid(), p_provider, r->>'id', r->>'kind', left(r->>'title', 160),
    coalesce((r->>'value')::numeric, 0), coalesce(r->>'unit', ''), (r->>'startedAt')::timestamptz, coalesce(r->'extras', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'id', '') <> '' and coalesce(r->>'kind', '') <> '' and r->>'startedAt' is not null
  on conflict (user_id, provider, external_id) do update set
    kind = excluded.kind, title = excluded.title, value = excluded.value, unit = excluded.unit,
    started_at = excluded.started_at, extras = excluded.extras
  where (public.proof_items.kind, public.proof_items.title, public.proof_items.value, public.proof_items.unit, public.proof_items.started_at, public.proof_items.extras)
    is distinct from (excluded.kind, excluded.title, excluded.value, excluded.unit, excluded.started_at, excluded.extras);
  get diagnostics n = row_count;
  update public.linked_accounts set last_synced_at = now() where user_id = auth.uid() and provider = p_provider;
  return n;
end $$;

/** Every app you've linked, as whom, and how fresh its proof is. */
create or replace function public.link_status() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'provider', a.provider, 'displayName', a.display_name, 'connectedAt', a.connected_at, 'lastSyncedAt', a.last_synced_at,
      'items', (select count(*) from public.proof_items i where i.user_id = a.user_id and i.provider = a.provider)
    ) order by a.provider), '[]'::jsonb)
  from public.linked_accounts a where a.user_id = auth.uid()
$$;

/** Unlink an app and forget everything copied from it. */
create or replace function public.link_disconnect(p_provider text) returns void
language sql security definer set search_path=public as $$
  delete from public.proof_items where user_id = auth.uid() and provider = p_provider;
  delete from public.linked_accounts where user_id = auth.uid() and provider = p_provider;
$$;

/**
 * A player's proof since a time, for a bet. Only for players who share the series
 * with you. Filters are optional. Also says which apps they've linked.
 */
create or replace function public.link_proof_for(
  p_series_id uuid, p_user_id uuid, p_since timestamptz, p_provider text default null, p_kind text default null
) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  if not public.is_bet_series_member(p_series_id, auth.uid()) or not public.is_bet_series_member(p_series_id, p_user_id) then
    perform public._bs_fail('not_member', 'You can only see linked-app proof for players in your series.');
  end if;
  return jsonb_build_object(
    'linked', coalesce((
      select jsonb_agg(jsonb_build_object('provider', a.provider, 'displayName', a.display_name, 'lastSyncedAt', a.last_synced_at) order by a.provider)
      from public.linked_accounts a where a.user_id = p_user_id
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('provider', i.provider, 'id', i.external_id, 'kind', i.kind, 'title', i.title, 'value', i.value,
        'unit', i.unit, 'startedAt', i.started_at, 'extras', i.extras) order by i.started_at desc)
      from (
        select * from public.proof_items i
        where i.user_id = p_user_id and i.started_at >= coalesce(p_since, '-infinity')
          and (p_provider is null or i.provider = p_provider) and (p_kind is null or i.kind = p_kind)
        order by i.started_at desc limit 500
      ) i
    ), '[]'::jsonb)
  );
end $$;

revoke all on table public.linked_accounts, public.proof_items from anon, authenticated;
revoke all on function public._link_check_provider(text) from public, anon, authenticated;

revoke all on function
  public.link_save_connection(text, text, text, text, text, timestamptz, text), public.link_my_tokens(text),
  public.link_update_tokens(text, text, text, timestamptz), public.link_save_items(text, jsonb), public.link_status(),
  public.link_disconnect(text), public.link_proof_for(uuid, uuid, timestamptz, text, text)
from public, anon;

grant execute on function
  public.link_save_connection(text, text, text, text, text, timestamptz, text), public.link_my_tokens(text),
  public.link_update_tokens(text, text, text, timestamptz), public.link_save_items(text, jsonb), public.link_status(),
  public.link_disconnect(text), public.link_proof_for(uuid, uuid, timestamptz, text, text)
to authenticated;
