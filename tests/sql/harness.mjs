// Runs the Supabase migrations in an in-process Postgres (PGlite), so the Bet
// Series rules can be tested without Docker, a Supabase project or any keys.
//
// Supabase pieces the migrations rely on are stood in for by a small shim:
// the `auth` schema with `auth.users`, `auth.uid()` and `auth.jwt()`, and the
// `anon` / `authenticated` roles. Calls run as `authenticated` with the JWT
// claims set, the same way PostgREST runs them, so RLS policies apply.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS = path.join(import.meta.dirname, "..", "..", "supabase", "migrations");

const SHIM = `
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), auth.jwt()->>'sub'), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
-- Supabase Realtime's publication, so migrations that add tables to it run as they would on Supabase.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
-- Supabase Storage, as far as the avatar bucket migration uses it.
create schema if not exists storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
`;

export class SqlError extends Error {
  constructor(err) {
    super(err.message);
    this.hint = err.hint;
    this.code = err.code;
  }
}

/**
 * A fresh database with the migrations applied in order. `upTo` stops before the
 * first migration whose file name sorts at or after it; `migrate()` applies the rest.
 */
export async function createDb({ upTo } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SHIM);
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  let pending = files;
  async function migrate(until) {
    while (pending.length && !(until && pending[0] >= until)) {
      const f = pending.shift();
      try {
        await db.exec(await readFile(path.join(MIGRATIONS, f), "utf8"));
      } catch (err) {
        throw new Error(`${f}: ${err.message}`);
      }
    }
  }
  await migrate(upTo);

  /** A signed-up Supabase user. `as` runs SQL as them through the `authenticated` role. */
  async function user(name, email = `${name.toLowerCase().replace(/\W+/g, ".")}@example.com`) {
    const id = randomUUID();
    const meta = { full_name: name };
    await db.query("insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, meta]);
    const claims = JSON.stringify({ sub: id, email, role: "authenticated", user_metadata: meta });

    async function as(sql, params = []) {
      return db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [claims, id]);
        await tx.exec("set local role authenticated");
        try {
          return (await tx.query(sql, params)).rows;
        } catch (err) {
          throw new SqlError(err);
        }
      });
    }

    /** Call an RPC by name with named arguments, the way supabase-js `rpc()` does. Returns the rows. */
    async function rpc(fn, args = {}) {
      const keys = Object.keys(args);
      const list = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
      return as(`select * from public.${fn}(${list})`, keys.map((k) => args[k]));
    }

    return { id, name, email, as, rpc };
  }

  /** Move the database clock: shifts timestamps backwards so "now" looks later. */
  async function ageBets(seriesId, minutes) {
    await db.query(
      `update public.series_bets set opened_at = opened_at - make_interval(mins => $2) where series_id = $1`,
      [seriesId, minutes]
    );
  }

  return { db, user, ageBets, migrate: () => migrate(), close: () => db.close() };
}
