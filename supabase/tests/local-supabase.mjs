// A stand-in for a Supabase project, for tests and offline checks only.
//
// It serves just what the Bet Series API and frontend use: email/password Auth
// (sign up, sign in, refresh, get user, sign out), PostgREST RPC calls
// (POST /rest/v1/rpc/:fn), and Realtime postgres_changes over a WebSocket for the
// tables in the `supabase_realtime` publication, delivered only to subscribers
// whose row-level security lets them read the row (as Supabase does). All backed
// by the real migrations in PGlite. Data lives in memory and is gone when it
// stops. Never point real users at it.
//
// Admin: POST /auth/v1/admin/users and DELETE /auth/v1/admin/users/:id, with SERVICE_KEY as the bearer.
// Test hook: POST /__test/realtime/drop closes every Realtime connection, so tests
// can check that clients reconnect and catch up without duplicates.
//
//   node supabase/tests/local-supabase.mjs            # http://localhost:54399
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npm run dev
//   MIGRATIONS_UP_TO=202611140013 node supabase/tests/local-supabase.mjs   # a database without clan chat
import http from "node:http";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createDb } from "./harness.mjs";

const PORT = Number(process.env.PORT ?? 54399);
const SECRET = randomBytes(32);
// MIGRATIONS_UP_TO=202611140013 stops before that migration, to see how the app behaves on a database that's behind.
const t = await createDb({ upTo: process.env.MIGRATIONS_UP_TO || undefined });
const accounts = new Map(); // email -> { id, password, meta }
const refreshTokens = new Map(); // token -> user id

const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}
function verify(token) {
  const [head, body, sig] = (token ?? "").split(".");
  if (!sig) return null;
  const want = createHmac("sha256", SECRET).update(`${head}.${body}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  return claims.exp * 1000 > Date.now() ? claims : null;
}

const userJson = (a, email) => ({
  id: a.id, aud: "authenticated", role: "authenticated", email, user_metadata: a.meta, app_metadata: { provider: "email" },
  created_at: new Date().toISOString(),
});
function session(email) {
  const a = accounts.get(email);
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({ sub: a.id, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, user_metadata: a.meta });
  const refresh_token = randomBytes(16).toString("hex");
  refreshTokens.set(refresh_token, email);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(a, email) };
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : {};
}

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept-profile, content-profile",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  });
  res.end(data === undefined ? "" : JSON.stringify(data));
}
const authError = (res, status, msg) => send(res, status, { code: status, error_code: "invalid_credentials", msg, message: msg });

/** Shape the rows like PostgREST: set-returning → array, composite → object, scalar → value. */
async function rpc(claims, fn, args) {
  const [info] = (await t.db.query(
    `select p.proretset as set, t.typtype as kind from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     join pg_type t on t.oid = p.prorettype where n.nspname = 'public' and p.proname = $1 limit 1`, [fn]
  )).rows;
  if (!info || fn.startsWith("_")) return { status: 404, body: { code: "PGRST202", message: `Could not find the function public.${fn}`, hint: null, details: null } };
  const keys = Object.keys(args);
  const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
  try {
    const rows = await t.db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify(claims ?? {}), claims?.sub ?? ""]);
      await tx.exec(`set local role ${claims ? "authenticated" : "anon"}`);
      return (await tx.query(sql, keys.map((k) => args[k]))).rows;
    });
    if (info.set) return { status: 200, body: rows };
    if (info.kind === "c") return { status: 200, body: rows[0] ?? null };
    return { status: 200, body: rows[0] ? Object.values(rows[0])[0] : null };
  } catch (err) {
    return { status: 400, body: { code: err.code ?? "P0001", message: err.message, hint: err.hint ?? null, details: err.detail ?? null } };
  }
}

/** Split "a,b(c,d),e" at top-level commas. */
function splitTop(str) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function ident(x) {
  if (!/^[a-z_][a-z0-9_]*$/.test(x)) throw new Error(`Unsupported name: ${x}`);
  return x;
}
function parseSelect(text) {
  const items = splitTop(text || "*");
  return {
    cols: items.filter((i) => !i.includes("(")).map((c) => (c === "*" ? "*" : ident(c))),
    embeds: items.filter((i) => i.includes("(")).map((i) => {
      const [, name, inner] = i.match(/^(\w+)\((.*)\)$/);
      return { name: ident(name), ...parseSelect(inner) };
    }),
  };
}

/**
 * A small slice of PostgREST table reads: columns, one-to-many embeds (child(cols)),
 * filters eq / neq / in / is, and order. Runs as the caller, so RLS applies.
 */
async function select(claims, table, params, wantObject) {
  const where = [];
  const values = [];
  for (const [k, v] of params) {
    if (k === "select" || k === "order" || k === "limit") continue;
    const m = v.match(/^(eq|neq|in|is)\.(.*)$/);
    if (!m) throw new Error(`Unsupported filter: ${k}=${v}`);
    const [, op, val] = m;
    if (op === "in") {
      values.push(val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")));
      where.push(`${ident(k)}::text = any($${values.length}::text[])`);
    } else if (op === "is") {
      where.push(`${ident(k)} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`);
    } else {
      values.push(val);
      where.push(`${ident(k)}::text ${op === "eq" ? "=" : "<>"} $${values.length}`);
    }
  }
  const order = params.get("order")?.split(",").map((o) => {
    const [c, dir] = o.split(".");
    return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}`;
  });
  const shape = parseSelect(params.get("select"));

  return t.db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify(claims ?? {}), claims?.sub ?? ""]);
    await tx.exec(`set local role ${claims ? "authenticated" : "anon"}`);

    async function run(tbl, { cols, embeds }, filterSql, filterValues, orderSql) {
      const fks = [];
      for (const e of embeds) {
        const fk = (await tx.query(
          `select a.attname as child_col, af.attname as parent_col from pg_constraint c
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
           join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
           where c.contype = 'f' and c.conrelid = $1::regclass and c.confrelid = $2::regclass limit 1`,
          [`public.${e.name}`, `public.${tbl}`]
        )).rows[0];
        if (!fk) throw new Error(`No relationship between ${tbl} and ${e.name}`);
        fks.push(fk);
      }
      const extra = fks.map((fk, i) => `${fk.parent_col}::text as __k${i}`);
      const list = [cols.length ? cols.join(", ") : "*", ...extra].join(", ");
      const rows = (await tx.query(
        `select ${list} from public.${tbl}${filterSql ? ` where ${filterSql}` : ""}${orderSql ? ` order by ${orderSql}` : ""}`,
        filterValues
      )).rows;
      for (const [i, e] of embeds.entries()) {
        const fk = fks[i];
        const keys = [...new Set(rows.map((r) => r[`__k${i}`]))];
        const childCols = e.cols.includes("*") || e.cols.includes(fk.child_col) ? e.cols : [...e.cols, fk.child_col];
        const kids = keys.length ? await run(e.name, { cols: childCols, embeds: e.embeds }, `${fk.child_col}::text = any($1::text[])`, [keys], "") : [];
        for (const r of rows) r[e.name] = kids.filter((k) => String(k[fk.child_col]) === r[`__k${i}`]);
      }
      for (const r of rows) for (let i = 0; i < embeds.length; i++) delete r[`__k${i}`];
      return rows;
    }

    const rows = await run(ident(table), shape, where.join(" and "), values, order?.join(", "));
    if (!wantObject) return { status: 200, body: rows };
    if (rows.length !== 1) {
      return { status: 406, body: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", hint: null, details: null } };
    }
    return { status: 200, body: rows[0] };
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204);
    const url = new URL(req.url, "http://localhost");
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const claims = verify(bearer);

    if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
      const { email, password, data } = await readBody(req);
      if (!email || !password || password.length < 6) return authError(res, 422, "Password should be at least 6 characters.");
      if (accounts.has(email)) return authError(res, 422, "User already registered");
      const id = randomUUID();
      const meta = data ?? {};
      accounts.set(email, { id, password, meta });
      await t.db.query("insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, meta]);
      return send(res, 200, session(email));
    }
    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const body = await readBody(req);
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const email = refreshTokens.get(body.refresh_token);
        if (!email) return authError(res, 400, "Invalid Refresh Token");
        return send(res, 200, session(email));
      }
      const a = accounts.get(body.email);
      if (!a || a.password !== body.password) return authError(res, 400, "Invalid login credentials");
      return send(res, 200, session(body.email));
    }
    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      if (!claims) return authError(res, 401, "invalid JWT");
      return send(res, 200, userJson(accounts.get(claims.email), claims.email));
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    // Admin user management, for scripts that make temporary users. Needs SERVICE_KEY as the bearer.
    if (url.pathname.startsWith("/auth/v1/admin/users")) {
      if (!process.env.SERVICE_KEY || bearer !== process.env.SERVICE_KEY) return authError(res, 401, "This endpoint requires a valid service key.");
      if (req.method === "POST" && url.pathname === "/auth/v1/admin/users") {
        const { email, password, user_metadata } = await readBody(req);
        if (accounts.has(email)) return authError(res, 422, "User already registered");
        const id = randomUUID();
        accounts.set(email, { id, password, meta: user_metadata ?? {} });
        await t.db.query("insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)", [id, email, user_metadata ?? {}]);
        return send(res, 200, userJson(accounts.get(email), email));
      }
      const dm = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/);
      if (req.method === "GET" && dm) {
        const found = [...accounts].find(([, a]) => a.id === dm[1]);
        return found ? send(res, 200, userJson(found[1], found[0])) : authError(res, 404, "User not found");
      }
      if (req.method === "DELETE" && dm) {
        await t.db.query("delete from auth.users where id = $1", [dm[1]]);
        for (const [email, a] of accounts) if (a.id === dm[1]) accounts.delete(email);
        return send(res, 200, {});
      }
    }
    if (url.pathname === "/__test/realtime/drop" && req.method === "POST") {
      const n = sockets.size;
      for (const sock of sockets) sock.destroy();
      return send(res, 200, { dropped: n });
    }
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m && req.method === "POST") {
      if (bearer && bearer !== process.env.SUPABASE_PUBLISHABLE_KEY && !claims) {
        return send(res, 401, { code: "PGRST301", message: "JWT expired", hint: null, details: null });
      }
      const out = await rpc(claims, m[1], await readBody(req));
      return send(res, out.status, out.body);
    }
    const tm = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (tm && req.method === "GET") {
      try {
        const out = await select(claims, tm[1], url.searchParams, /vnd\.pgrst\.object/.test(req.headers.accept ?? ""));
        return send(res, out.status, out.body);
      } catch (err) {
        return send(res, 400, { code: err.code ?? "PGRST100", message: err.message, hint: err.hint ?? null, details: null });
      }
    }
    return send(res, 404, { message: `Not in the local stand-in: ${req.method} ${url.pathname}` });
  } catch (err) {
    console.error(err);
    return send(res, 500, { message: String(err) });
  }
});


// ---------- Realtime (postgres_changes only) ----------
//
// The Realtime protocol is Phoenix channels over a WebSocket (realtime-js uses the
// "2.0.0" serializer: each message is a JSON array [join_ref, ref, topic, event, payload]).
// Changes are captured by a trigger on every table in the supabase_realtime
// publication and checked against each subscriber's RLS before they're sent.

await t.db.exec(`
  create table if not exists public._rt_changes (
    id bigint generated always as identity primary key, tbl text not null, type text not null,
    record jsonb, old_record jsonb, at timestamptz not null default now());
  create or replace function public._rt_capture() returns trigger language plpgsql as $f$
  begin
    insert into public._rt_changes(tbl, type, record, old_record)
    values (tg_table_name, tg_op, case when tg_op = 'DELETE' then null else to_jsonb(new) end,
      case when tg_op = 'INSERT' then null else to_jsonb(old) end);
    return null;
  end $f$;
  revoke all on public._rt_changes from anon, authenticated;
`);
for (const { tablename } of (await t.db.query(
  "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'"
)).rows) {
  await t.db.exec(`create trigger _rt_capture after insert or update or delete on public.${ident(tablename)}
    for each row execute function public._rt_capture()`);
}

const sockets = new Set();
let bindingSeq = 1000;

function wsFrame(text) {
  const data = Buffer.from(text);
  const head = data.length < 126 ? Buffer.from([0x81, data.length])
    : data.length < 65536 ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
    : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(data.length)); return b; })()]);
  return Buffer.concat([head, data]);
}

/** Pull whole frames off the front of a buffer: [{ op, data }], rest. */
function wsParse(buf) {
  const out = [];
  for (;;) {
    if (buf.length < 2) break;
    const op = buf[0] & 15;
    let len = buf[1] & 127;
    let off = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
    const masked = buf[1] & 128;
    const need = off + (masked ? 4 : 0) + len;
    if (buf.length < need) break;
    let data = buf.subarray(off + (masked ? 4 : 0), need);
    if (masked) {
      const mask = buf.subarray(off, off + 4);
      data = Buffer.from(data.map((b, i) => b ^ mask[i & 3]));
    }
    out.push({ op, data });
    buf = buf.subarray(need);
  }
  return [out, buf];
}

/** One connected client: its channels and their postgres_changes bindings. */
function realtimeSocket(sock) {
  sockets.add(sock);
  const channels = new Map(); // topic -> { joinRef, claims, bindings: [{ id, event, schema, table, filter }] }
  const push = (msg) => !sock.destroyed && sock.write(wsFrame(JSON.stringify(msg)));
  const reply = (joinRef, ref, topic, status, response = {}) => push([joinRef, ref, topic, "phx_reply", { status, response }]);
  let buf = Buffer.alloc(0);
  sock.on("data", (chunk) => {
    let frames;
    [frames, buf] = wsParse(Buffer.concat([buf, chunk]));
    for (const { op, data } of frames) {
      if (op === 8) return sock.end();
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
      if (op !== 1) continue;
      let joinRef, ref, topic, event, payload;
      try { [joinRef, ref, topic, event, payload] = JSON.parse(data.toString()); } catch { continue; }
      if (topic === "phoenix" && event === "heartbeat") { reply(null, ref, topic, "ok"); continue; }
      if (event === "phx_join") {
        const token = payload?.access_token;
        const claims = token ? verify(token) : null;
        // A user's JWT that doesn't verify (expired, forged) is refused. Anything else, like the
        // publishable key, joins as `anon`, which RLS shows nothing (as on Supabase).
        if (token && token.split(".").length === 3 && !claims) {
          reply(joinRef, ref, topic, "error", { reason: "Invalid JWT" });
          continue;
        }
        const bindings = (payload?.config?.postgres_changes ?? []).map((b) => ({ ...b, id: bindingSeq++ }));
        channels.set(topic, { joinRef, claims, bindings });
        reply(joinRef, ref, topic, "ok", { postgres_changes: bindings.map(({ id, event: e, schema, table, filter }) => ({ id, event: e, schema, table, ...(filter ? { filter } : {}) })) });
        push([joinRef, null, topic, "system", { status: "ok", message: "Subscribed to PostgreSQL", extension: "postgres_changes", channel: topic.replace(/^realtime:/, "") }]);
        continue;
      }
      if (event === "access_token") {
        const ch = channels.get(topic);
        const claims = verify(payload?.access_token);
        if (ch && claims) ch.claims = claims;
        continue;
      }
      if (event === "phx_leave") { channels.delete(topic); reply(joinRef, ref, topic, "ok"); continue; }
      if (ref) reply(joinRef, ref, topic, "ok");
    }
  });
  const gone = () => { sockets.delete(sock); channels.clear(); };
  sock.on("close", gone);
  sock.on("error", gone);
  sock.rtChannels = channels;
  sock.rtPush = push;
}

/** Whether this subscriber's RLS lets them read the row. */
async function canSee(claims, table, row) {
  if (!claims || row?.id === undefined) return false;
  return t.db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify(claims), claims.sub]);
    await tx.exec("set local role authenticated");
    return (await tx.query(`select 1 from public.${ident(table)} where id::text = $1`, [String(row.id)])).rows.length > 0;
  });
}

const filterOk = (filter, row) => {
  if (!filter) return true;
  const m = filter.match(/^(\w+)=eq\.(.+)$/);
  return !!m && row && String(row[m[1]]) === m[2];
};

let lastChange = 0;
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    const changes = (await t.db.query("select * from public._rt_changes where id > $1 order by id", [lastChange])).rows;
    for (const c of changes) {
      lastChange = Number(c.id);
      const row = c.record ?? c.old_record;
      for (const sock of sockets) {
        for (const [topic, ch] of sock.rtChannels) {
          const ids = ch.bindings
            .filter((b) => b.schema === "public" && b.table === c.tbl && (b.event === "*" || b.event === c.type) && filterOk(b.filter, row))
            .map((b) => b.id);
          // Like Supabase, deletes carry no row data, so they skip the RLS check; inserts and updates need it.
          if (!ids.length || (c.type !== "DELETE" && !(await canSee(ch.claims, c.tbl, row)))) continue;
          sock.rtPush([null, null, topic, "postgres_changes", {
            ids,
            data: { schema: "public", table: c.tbl, commit_timestamp: new Date(c.at).toISOString(), type: c.type, columns: [],
              record: c.record ?? {}, old_record: c.type === "DELETE" ? { id: c.old_record?.id } : c.old_record ?? undefined, errors: null },
          }]);
        }
      }
    }
  } catch (err) {
    console.error("realtime:", err);
  } finally {
    pumping = false;
  }
}
setInterval(pump, 100).unref();

server.on("upgrade", (req, sock) => {
  const url = new URL(req.url, "http://localhost");
  const key = req.headers["sec-websocket-key"];
  if (url.pathname !== "/realtime/v1/websocket" || !key) return sock.destroy();
  const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  realtimeSocket(sock);
});

server.listen(PORT, () => console.log(`Local Supabase stand-in on http://localhost:${PORT} (in memory, test only)`));
