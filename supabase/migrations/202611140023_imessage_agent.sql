-- The Bookie messaging agent (Photon Spectrum): players text Bookie on iMessage
-- (or WhatsApp / Telegram) to see open bets, place wagers and check standings.
--
-- How a phone becomes a player:
--   1. In the app, Profile → Text Bookie → "Get a link code" (imessage_link_code).
--   2. The player texts "link CODE" to Bookie's number. The agent calls agent_link
--      with the sender's address; the code is used up and the address now acts
--      as that player.
--
-- How the agent acts as a player: it holds a shared secret (set once with
-- set_bookie_agent_secret from the SQL editor; only its SHA-256 is stored). Every
-- agent_* function checks it, looks up the player linked to the sender, sets
-- that player's JWT claims for this transaction only, and calls the normal
-- rule functions. So the agent can do exactly what that player could do in
-- the app and nothing more; it never gets the service-role key.

create table if not exists public.agent_config (
  id int primary key default 1 check (id = 1),
  secret_sha256 text not null,
  updated_at timestamptz not null default now()
);

/** A sender address on a platform, e.g. "iMessage:+15551234567", linked to one player. */
create table if not exists public.agent_links (
  handle text primary key check (char_length(handle) between 3 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now()
);
create index if not exists agent_links_user on public.agent_links(user_id);

/** One-time codes from the app, valid for 15 minutes. One live code per player. */
create table if not exists public.agent_link_codes (
  code text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.agent_config enable row level security;
alter table public.agent_links enable row level security;
alter table public.agent_link_codes enable row level security;
revoke all on table public.agent_config, public.agent_links, public.agent_link_codes from anon, authenticated;

-- ---------- setup (SQL editor only) ----------

/** Run once from the SQL editor: select public.set_bookie_agent_secret('<the agent secret>'); */
create or replace function public.set_bookie_agent_secret(p_secret text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_secret is null or char_length(p_secret) < 32 then
    raise exception using message = 'Use a random secret of at least 32 characters.', hint = 'invalid_secret';
  end if;
  insert into public.agent_config(id, secret_sha256) values (1, encode(sha256(convert_to(p_secret, 'UTF8')), 'hex'))
  on conflict (id) do update set secret_sha256 = excluded.secret_sha256, updated_at = now();
end $$;

-- ---------- the app side: a player links or unlinks their phone ----------

/** A fresh link code for the signed-in player (replaces any earlier one). */
create or replace function public.imessage_link_code() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_code text; v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  delete from public.agent_link_codes where user_id = auth.uid() or expires_at < now();
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    begin
      insert into public.agent_link_codes(code, user_id, expires_at) values (v_code, auth.uid(), now() + interval '15 minutes');
      exit;
    exception when unique_violation then -- try another code
    end;
  end loop;
  return jsonb_build_object('code', v_code, 'expiresAt', public._bs_iso(now() + interval '15 minutes'));
end $$;

/** "+1 •••• 4567" style: enough to recognise your own number, not to read someone else's. */
create or replace function public._agent_mask(p_handle text) returns text language sql immutable as $$
  select split_part(p_handle, ':', 1) || ' ending ' || right(regexp_replace(split_part(p_handle, ':', 2), '[^0-9A-Za-z]', '', 'g'), 4)
$$;

/** The signed-in player's linked phones, masked. */
create or replace function public.imessage_links() returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', md5(l.handle), 'label', public._agent_mask(l.handle), 'linkedAt', public._bs_iso(l.linked_at))
    order by l.linked_at), '[]'::jsonb)
  from public.agent_links l where l.user_id = auth.uid()
$$;

/** Unlink one of your phones (p_id from imessage_links), or all of them with null. Returns how many. */
create or replace function public.imessage_unlink(p_id text default null) returns int
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  if auth.uid() is null then perform public._bs_fail('unauthorized', 'Sign in first.'); end if;
  delete from public.agent_links where user_id = auth.uid() and (p_id is null or md5(handle) = p_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- the agent side ----------

create or replace function public._agent_check(p_secret text) returns void
language plpgsql stable security definer set search_path=public as $$
begin
  if p_secret is null or not exists (
    select 1 from public.agent_config where secret_sha256 = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then
    perform public._bs_fail('agent_unauthorized', 'The agent secret is wrong or not set.');
  end if;
end $$;

/**
 * Become the player linked to p_handle for the rest of this transaction, the way a
 * signed-in request would (auth.uid(), auth.jwt() with their email and profile).
 * Returns their id, or null when the address isn't linked.
 */
create or replace function public._agent_become(p_handle text) returns uuid
language plpgsql security definer set search_path=public as $$
declare u auth.users;
begin
  select au.* into u from public.agent_links l join auth.users au on au.id = l.user_id where l.handle = p_handle;
  if not found then return null; end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', u.id, 'role', 'authenticated', 'email', u.email, 'user_metadata', coalesce(u.raw_user_meta_data, '{}'::jsonb)
  )::text, true);
  perform set_config('request.jwt.claim.sub', u.id::text, true);
  return u.id;
end $$;

/** "link CODE" from a phone. Uses up the code; the address then acts as that player. Returns their name. */
create or replace function public.agent_link(p_secret text, p_handle text, p_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
  perform public._agent_check(p_secret);
  if p_handle is null or char_length(p_handle) not between 3 and 200 then perform public._bs_fail('invalid_handle', 'Unknown sender.'); end if;
  delete from public.agent_link_codes where code = upper(trim(coalesce(p_code, ''))) and expires_at > now() returning user_id into v_user;
  if v_user is null then perform public._bs_fail('invalid_code', 'That code didn''t work. Codes last 15 minutes; get a new one on your Profile.'); end if;
  insert into public.agent_links(handle, user_id) values (p_handle, v_user)
  on conflict (handle) do update set user_id = excluded.user_id, linked_at = now();
  perform public._agent_become(p_handle);
  return jsonb_build_object('userId', v_user, 'name', public._bs_me_name());
end $$;

/** "unlink" from a phone. */
create or replace function public.agent_unlink(p_secret text, p_handle text) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  perform public._agent_check(p_secret);
  delete from public.agent_links where handle = p_handle;
  return found;
end $$;

/** Everything the player would see in the app: { linked, me, series }. */
create or replace function public.agent_state(p_secret text, p_handle text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public._agent_check(p_secret);
  if public._agent_become(p_handle) is null then return jsonb_build_object('linked', false); end if;
  return public.my_series_state() || jsonb_build_object('linked', true);
end $$;

/**
 * Place a wager as the linked player, once per p_request_id (the agent derives it from
 * the message id, so a message delivered twice charges once). Same rules as the app.
 */
create or replace function public.agent_wager(
  p_secret text, p_handle text, p_request_id uuid, p_series_id uuid, p_bet_id uuid, p_outcome text, p_amount bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform public._agent_check(p_secret);
  if public._agent_become(p_handle) is null then
    perform public._bs_fail('not_linked', 'Link your phone first: Profile → Text Bookie in the app.');
  end if;
  return public.place_series_wager_once(p_request_id, p_series_id, p_bet_id, p_outcome, p_amount);
end $$;

-- ---------- permissions ----------

revoke all on function
  public.set_bookie_agent_secret(text), public._agent_check(text), public._agent_become(text), public._agent_mask(text)
from public, anon, authenticated;

revoke all on function public.imessage_link_code(), public.imessage_links(), public.imessage_unlink(text) from public, anon;
grant execute on function public.imessage_link_code(), public.imessage_links(), public.imessage_unlink(text) to authenticated;

-- The agent signs in as nobody: it calls these with the publishable key, and the secret is the check.
revoke all on function
  public.agent_link(text, text, text), public.agent_unlink(text, text), public.agent_state(text, text),
  public.agent_wager(text, text, uuid, uuid, uuid, text, bigint)
from public;
grant execute on function
  public.agent_link(text, text, text), public.agent_unlink(text, text), public.agent_state(text, text),
  public.agent_wager(text, text, uuid, uuid, uuid, text, bigint)
to anon, authenticated;
