// A stand-in for a Supabase project, for tests and offline checks only.
//
// It serves just what the Bet Series API and frontend use: email/password Auth
// (sign up, sign in, refresh, get user, sign out) and PostgREST RPC calls
// (POST /rest/v1/rpc/:fn), backed by the real migrations in PGlite. Data lives
// in memory and is gone when it stops. Never point real users at it.
//
//   node supabase/tests/local-supabase.mjs            # http://localhost:54399
//   SUPABASE_URL=http://localhost:54399 SUPABASE_PUBLISHABLE_KEY=local npm run dev
import http from "node:http";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createDb } from "./harness.mjs";

const PORT = Number(process.env.PORT ?? 54399);
const SECRET = randomBytes(32);
const t = await createDb();
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

server.listen(PORT, () => console.log(`Local Supabase stand-in on http://localhost:${PORT} (in memory, test only)`));
