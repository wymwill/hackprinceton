import "server-only";
import { AppError } from "./errors";
import type { SeriesCtx } from "./seriesApi";

/**
 * Linked accounts: Strava, Fitbit, Oura, Whoop, Spotify (OAuth) and GitHub (a
 * public username). Each player's own app calls these with their own sign-in, so
 * tokens and proof go through the RPCs in
 * supabase/migrations/202611140020_linked_accounts.sql, never a secret key.
 *
 * Every app's data becomes "proof items": { id, kind, title, value, unit, startedAt, extras }.
 * Kinds: run, ride, walk, hike, swim, workout, steps_day, sleep_night, readiness_day,
 * recovery_day, listen, push, pull_request.
 */

export const PROVIDERS = ["strava", "fitbit", "oura", "whoop", "spotify", "github"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export type ProofRow = {
  id: string;
  kind: string;
  title: string | null;
  value: number;
  unit: string;
  startedAt: string;
  extras?: Record<string, unknown>;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  scope?: string;
  user_id?: string;
  athlete?: { id: number; firstname?: string; lastname?: string };
};

type OAuth = {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Proof Key for Code Exchange: the browser makes a verifier and sends its challenge. */
  pkce: boolean;
  /** How the token endpoint wants the app's credentials. "public" = client_id only (PKCE apps without a secret). */
  clientAuth: "body" | "basic" | "public";
  /** Extra query parameters for the authorize page. */
  params?: Record<string, string>;
  revokeUrl?: (token: string) => { url: string; init: RequestInit };
};

type Provider = {
  id: ProviderId;
  label: string;
  /** Env var prefix for <PREFIX>_CLIENT_ID / <PREFIX>_CLIENT_SECRET. */
  env?: string;
  oauth?: OAuth;
  /** Which account this is, from the token response (and an API call if needed). */
  identify: (t: TokenResponse) => Promise<{ externalId: string; displayName: string | null }>;
  /** Proof since a time. */
  fetch: (auth: { accessToken: string | null; externalId: string; displayName: string | null }, from: Date) => Promise<ProofRow[]>;
};

// ---------- helpers ----------

const DAY = 86_400_000;
const day = (d: Date) => d.toISOString().slice(0, 10);
/** A whole day as a moment: noon UTC lands on that date wherever you are. */
const dayAt = (date: string) => `${date}T12:00:00Z`;
/** Local times without a zone (Fitbit) are read as UTC. */
const asUtc = (t: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

async function getJson<T>(url: string, token: string | null, label: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: "application/json", ...headers } });
  if (res.status === 401) throw new AppError(409, "link_not_connected", `${label} access was removed or expired. Link it again.`);
  if (res.status === 403) throw new AppError(403, "link_forbidden", `${label} didn't allow that. Link it again and allow every permission it asks for.`);
  if (res.status === 404) throw new AppError(404, "link_not_found", `${label} couldn't find that account.`);
  if (res.status === 429) throw new AppError(429, "link_busy", `${label} is busy. Try again in a few minutes.`);
  if (!res.ok) {
    console.error(`${label} request failed:`, res.status, url, await res.text().catch(() => ""));
    throw new AppError(502, "link_failed", `Couldn't reach ${label}. Try again.`);
  }
  return res.json() as Promise<T>;
}

/** Follow `next_token`-style pages, up to a limit. */
async function pages<T>(first: string, next: (token: string) => string, token: string, label: string, max = 4): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = first;
  for (let i = 0; url && i < max; i++) {
    const r: { data?: T[]; records?: T[]; next_token?: string | null } = await getJson(url, token, label);
    out.push(...(r.data ?? r.records ?? []));
    url = r.next_token ? next(r.next_token) : null;
  }
  return out;
}

const SPORT: Record<string, string> = {
  run: "run", trailrun: "run", virtualrun: "run", running: "run", treadmill: "run",
  ride: "ride", virtualride: "ride", ebikeride: "ride", mountainbikeride: "ride", gravelride: "ride", cycling: "ride", spin: "ride",
  walk: "walk", walking: "walk", hike: "hike", hiking: "hike", swim: "swim", swimming: "swim",
};
const sportKind = (s?: string | null) => SPORT[(s ?? "").toLowerCase().replace(/[^a-z]/g, "")] ?? "workout";

// ---------- providers ----------

const strava: Provider = {
  id: "strava",
  label: "Strava",
  env: "STRAVA",
  oauth: {
    authorizeUrl: "https://www.strava.com/oauth/authorize",
    tokenUrl: "https://www.strava.com/oauth/token",
    scope: "read,activity:read",
    pkce: false,
    clientAuth: "body",
    params: { approval_prompt: "auto" },
    revokeUrl: (token) => ({ url: "https://www.strava.com/oauth/deauthorize", init: { method: "POST", headers: { Authorization: `Bearer ${token}` } } }),
  },
  identify: async (t) => {
    if (!t.athlete?.id) throw new AppError(502, "link_failed", "Strava didn't say which account this is.");
    return { externalId: String(t.athlete.id), displayName: [t.athlete.firstname, t.athlete.lastname].filter(Boolean).join(" ") || null };
  },
  fetch: async ({ accessToken }, from) => {
    type A = { id: number; sport_type?: string; type?: string; name?: string; distance?: number; moving_time?: number; start_date: string };
    const rows: ProofRow[] = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await getJson<A[]>(
        `https://www.strava.com/api/v3/athlete/activities?after=${Math.floor(from.getTime() / 1000)}&per_page=100&page=${page}`,
        accessToken,
        "Strava"
      );
      for (const a of batch) {
        const sport = a.sport_type ?? a.type ?? "Workout";
        rows.push({
          id: String(a.id),
          kind: sportKind(sport),
          title: a.name ?? sport,
          value: a.distance ?? 0,
          unit: "m",
          startedAt: a.start_date,
          extras: { sport, movingSeconds: a.moving_time ?? 0 },
        });
      }
      if (batch.length < 100) break;
    }
    return rows;
  },
};

const fitbit: Provider = {
  id: "fitbit",
  label: "Fitbit",
  env: "FITBIT",
  oauth: {
    authorizeUrl: "https://www.fitbit.com/oauth2/authorize",
    tokenUrl: "https://api.fitbit.com/oauth2/token",
    scope: "activity sleep",
    pkce: true,
    clientAuth: "basic",
  },
  identify: async (t) => {
    if (!t.user_id) throw new AppError(502, "link_failed", "Fitbit didn't say which account this is.");
    return { externalId: t.user_id, displayName: null };
  },
  fetch: async ({ accessToken }, from) => {
    const start = day(from);
    const end = day(new Date());
    const steps = await getJson<{ "activities-steps": { dateTime: string; value: string }[] }>(
      `https://api.fitbit.com/1/user/-/activities/steps/date/${start}/${end}.json`,
      accessToken,
      "Fitbit"
    );
    const sleep = await getJson<{ sleep: { logId: number; dateOfSleep: string; startTime: string; minutesAsleep: number; isMainSleep?: boolean }[] }>(
      `https://api.fitbit.com/1.2/user/-/sleep/date/${start}/${end}.json`,
      accessToken,
      "Fitbit"
    );
    return [
      ...steps["activities-steps"]
        .filter((d) => num(d.value) > 0)
        .map((d) => ({ id: `steps-${d.dateTime}`, kind: "steps_day", title: `Steps on ${d.dateTime}`, value: num(d.value), unit: "steps", startedAt: dayAt(d.dateTime) })),
      ...sleep.sleep.map((s) => ({
        id: `sleep-${s.logId}`,
        kind: "sleep_night",
        title: s.isMainSleep === false ? "Nap" : `Sleep, night of ${s.dateOfSleep}`,
        value: s.minutesAsleep,
        unit: "min",
        startedAt: new Date(asUtc(s.startTime)).toISOString(),
        extras: { night: s.dateOfSleep, main: s.isMainSleep !== false },
      })),
    ];
  },
};

const OURA = "https://api.ouraring.com/v2/usercollection";
const oura: Provider = {
  id: "oura",
  label: "Oura",
  env: "OURA",
  oauth: {
    authorizeUrl: "https://cloud.ouraring.com/oauth/authorize",
    tokenUrl: "https://api.ouraring.com/oauth/token",
    scope: "daily sleep workout",
    pkce: false,
    clientAuth: "body",
  },
  identify: async (t) => {
    const me = await getJson<{ id: string }>(`${OURA}/personal_info`, t.access_token, "Oura");
    return { externalId: me.id, displayName: null };
  },
  fetch: async ({ accessToken }, from) => {
    const q = `start_date=${day(from)}&end_date=${day(new Date(Date.now() + DAY))}`;
    const list = <T>(path: string) => pages<T>(`${OURA}/${path}?${q}`, (n) => `${OURA}/${path}?${q}&next_token=${encodeURIComponent(n)}`, accessToken!, "Oura");
    const [sleep, ready, workouts] = await Promise.all([
      list<{ id: string; day: string; score: number | null }>("daily_sleep"),
      list<{ id: string; day: string; score: number | null }>("daily_readiness"),
      list<{ id: string; activity: string; start_datetime: string; distance?: number | null; calories?: number | null; intensity?: string }>("workout"),
    ]);
    return [
      ...sleep.filter((s) => s.score != null).map((s) => ({ id: `sleep-${s.id}`, kind: "sleep_night", title: `Sleep score, ${s.day}`, value: num(s.score), unit: "score", startedAt: dayAt(s.day) })),
      ...ready.filter((r) => r.score != null).map((r) => ({ id: `ready-${r.id}`, kind: "readiness_day", title: `Readiness, ${r.day}`, value: num(r.score), unit: "score", startedAt: dayAt(r.day) })),
      ...workouts.map((w) => ({
        id: `workout-${w.id}`,
        kind: sportKind(w.activity),
        title: w.activity.replace(/_/g, " "),
        value: num(w.distance),
        unit: "m",
        startedAt: w.start_datetime,
        extras: { calories: w.calories ?? null, intensity: w.intensity ?? null },
      })),
    ];
  },
};

const WHOOP = "https://api.prod.whoop.com/developer/v2";
const whoop: Provider = {
  id: "whoop",
  label: "Whoop",
  env: "WHOOP",
  oauth: {
    authorizeUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    scope: "read:recovery read:sleep read:workout read:profile offline",
    pkce: false,
    clientAuth: "body",
  },
  identify: async (t) => {
    const me = await getJson<{ user_id: number; first_name?: string; last_name?: string }>(`${WHOOP}/user/profile/basic`, t.access_token, "Whoop");
    return { externalId: String(me.user_id), displayName: [me.first_name, me.last_name].filter(Boolean).join(" ") || null };
  },
  fetch: async ({ accessToken }, from) => {
    const q = `start=${encodeURIComponent(from.toISOString())}&limit=25`;
    const list = <T>(path: string) => pages<T>(`${WHOOP}/${path}?${q}`, (n) => `${WHOOP}/${path}?${q}&nextToken=${encodeURIComponent(n)}`, accessToken!, "Whoop");
    type Stage = { total_light_sleep_time_milli?: number; total_slow_wave_sleep_time_milli?: number; total_rem_sleep_time_milli?: number };
    const [recoveries, sleeps, workouts] = await Promise.all([
      list<{ cycle_id: number; created_at: string; score?: { recovery_score?: number } | null }>("recovery"),
      list<{ id: string; start: string; nap?: boolean; score?: { stage_summary?: Stage } | null }>("activity/sleep"),
      list<{ id: string; start: string; sport_name?: string; score?: { distance_meter?: number; strain?: number } | null }>("activity/workout"),
    ]);
    const asleep = (s?: Stage) => Math.round(((s?.total_light_sleep_time_milli ?? 0) + (s?.total_slow_wave_sleep_time_milli ?? 0) + (s?.total_rem_sleep_time_milli ?? 0)) / 60_000);
    return [
      ...recoveries
        .filter((r) => r.score?.recovery_score != null)
        .map((r) => ({ id: `recovery-${r.cycle_id}`, kind: "recovery_day", title: "Recovery", value: num(r.score!.recovery_score), unit: "%", startedAt: r.created_at })),
      ...sleeps
        .filter((s) => s.score?.stage_summary)
        .map((s) => ({ id: `sleep-${s.id}`, kind: "sleep_night", title: s.nap ? "Nap" : "Sleep", value: asleep(s.score!.stage_summary), unit: "min", startedAt: s.start, extras: { nap: !!s.nap } })),
      ...workouts.map((w) => ({
        id: `workout-${w.id}`,
        kind: sportKind(w.sport_name),
        title: (w.sport_name ?? "Workout").replace(/[-_]/g, " "),
        value: num(w.score?.distance_meter),
        unit: "m",
        startedAt: w.start,
        extras: { strain: w.score?.strain ?? null },
      })),
    ];
  },
};

const spotify: Provider = {
  id: "spotify",
  label: "Spotify",
  env: "SPOTIFY",
  oauth: {
    authorizeUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    scope: "user-read-recently-played",
    pkce: true,
    clientAuth: "public",
  },
  identify: async (t) => {
    const me = await getJson<{ id: string; display_name?: string | null }>("https://api.spotify.com/v1/me", t.access_token, "Spotify");
    return { externalId: me.id, displayName: me.display_name ?? me.id };
  },
  // Spotify only keeps your last 50 plays, so each play is stored on its own and the app syncs often.
  fetch: async ({ accessToken }, from) => {
    type Play = { played_at: string; track: { id: string; name: string; duration_ms: number; artists: { name: string }[] } };
    const r = await getJson<{ items: Play[] }>(`https://api.spotify.com/v1/me/player/recently-played?limit=50&after=${from.getTime()}`, accessToken, "Spotify");
    return r.items.map((p) => ({
      id: `play-${p.played_at}`,
      kind: "listen",
      title: `${p.track.name} · ${p.track.artists.map((a) => a.name).join(", ")}`,
      value: Math.round((p.track.duration_ms / 60_000) * 10) / 10,
      unit: "min",
      startedAt: p.played_at,
      extras: { artist: p.track.artists[0]?.name ?? null, trackId: p.track.id },
    }));
  },
};

const githubHeaders = () => ({
  "User-Agent": "Alea",
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

const github: Provider = {
  id: "github",
  label: "GitHub",
  identify: async () => {
    throw new AppError(400, "link_failed", "GitHub links by username.");
  },
  // Public events only: no sign-in, no token. GitHub keeps the last 90 days, up to 300 events.
  fetch: async ({ displayName }, from) => {
    type Ev = {
      id: string;
      type: string;
      created_at: string;
      repo: { name: string };
      payload: { size?: number; commits?: unknown[]; action?: string; number?: number; pull_request?: { merged?: boolean; title?: string; html_url?: string; number?: number } };
    };
    const rows: ProofRow[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(displayName ?? "")}/events/public?per_page=100&page=${page}`, { headers: githubHeaders() });
      if (res.status === 404) throw new AppError(404, "link_not_found", "GitHub couldn't find that username anymore.");
      if (res.status === 403 || res.status === 429) throw new AppError(429, "link_busy", "GitHub's limit for this server is used up. Try again within the hour.");
      if (!res.ok) throw new AppError(502, "link_failed", "Couldn't reach GitHub. Try again.");
      const events = (await res.json()) as Ev[];
      for (const e of events) {
        if (Date.parse(e.created_at) < from.getTime()) continue;
        if (e.type === "PushEvent") {
          // GitHub's public events no longer say how many commits a push had, so pushes are counted.
          // Older events that still carry the count keep it in extras.
          const commits = e.payload.size ?? e.payload.commits?.length ?? null;
          rows.push({ id: `event-${e.id}`, kind: "push", title: `Pushed to ${e.repo.name}`, value: 1, unit: "pushes", startedAt: e.created_at, extras: { repo: e.repo.name, commits } });
        } else if (e.type === "PullRequestEvent" && (e.payload.action === "merged" || (e.payload.action === "closed" && e.payload.pull_request?.merged))) {
          // Newer events report merges as their own action and leave the title out.
          const pr = e.payload.pull_request ?? {};
          const number = pr.number ?? e.payload.number;
          rows.push({
            id: `event-${e.id}`,
            kind: "pull_request",
            title: pr.title ? `Merged: ${pr.title}` : `Merged #${number ?? "?"} in ${e.repo.name}`,
            value: 1,
            unit: "merged",
            startedAt: e.created_at,
            extras: { repo: e.repo.name, url: pr.html_url ?? (number ? `https://github.com/${e.repo.name}/pull/${number}` : null) },
          });
        }
      }
      if (events.length < 100) break;
    }
    return rows;
  },
};

const REGISTRY: Record<ProviderId, Provider> = { strava, fitbit, oura, whoop, spotify, github };

// ---------- public API ----------

function provider(id: string): Provider {
  if (!(PROVIDERS as readonly string[]).includes(id)) throw new AppError(404, "unknown_provider", "That app can't be linked.");
  return REGISTRY[id as ProviderId];
}

function credentials(p: Provider) {
  if (!p.oauth) return null;
  const clientId = process.env[`${p.env}_CLIENT_ID`] || undefined;
  const clientSecret = process.env[`${p.env}_CLIENT_SECRET`] || undefined;
  if (!clientId) return null;
  if (p.oauth.clientAuth !== "public" && !clientSecret) return null;
  return { clientId, clientSecret };
}

function requireCredentials(p: Provider) {
  const c = credentials(p);
  if (!c) throw new AppError(503, "link_not_configured", `${p.label} isn't set up on this server yet.`);
  return c;
}

/** What the browser needs to show each app and start its sign-in. Never includes secrets. */
export function providersForClient() {
  return PROVIDERS.map((id) => {
    const p = REGISTRY[id];
    const c = credentials(p);
    return {
      id,
      label: p.label,
      method: p.oauth ? ("oauth" as const) : ("username" as const),
      configured: p.oauth ? !!c : true,
      authorize: p.oauth && c ? { url: p.oauth.authorizeUrl, clientId: c.clientId, scope: p.oauth.scope, pkce: p.oauth.pkce, params: p.oauth.params ?? {} } : null,
    };
  });
}

async function tokenRequest(p: Provider, params: Record<string, string>): Promise<TokenResponse> {
  const o = p.oauth!;
  const { clientId, clientSecret } = requireCredentials(p);
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (o.clientAuth === "basic") headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  else {
    body.set("client_id", clientId);
    if (o.clientAuth === "body") body.set("client_secret", clientSecret!);
  }
  const res = await fetch(o.tokenUrl, { method: "POST", headers, body });
  if (!res.ok) {
    console.error(`${p.label} token request failed:`, res.status, await res.text().catch(() => ""));
    throw new AppError(502, "link_failed", res.status >= 400 && res.status < 500 ? `${p.label} didn't accept that sign-in. Link it again.` : `Couldn't reach ${p.label}. Try again.`);
  }
  return res.json();
}

const expiry = (t: TokenResponse) =>
  t.expires_at ? new Date(t.expires_at * 1000).toISOString() : t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;

const CALLBACK = (id: string) => new RegExp(`^https?://[^/?#]+/connect/${id}/callback$`);

/** Finish linking an OAuth app: trade the code for tokens, save the link, then copy proof in. */
export async function exchange(ctx: SeriesCtx, id: string) {
  const p = provider(id);
  if (!p.oauth) throw new AppError(400, "link_failed", `${p.label} links by username.`);
  const code = typeof ctx.body.code === "string" ? ctx.body.code : "";
  const redirectUri = typeof ctx.body.redirectUri === "string" ? ctx.body.redirectUri : "";
  const verifier = typeof ctx.body.codeVerifier === "string" ? ctx.body.codeVerifier : "";
  if (!code) throw new AppError(400, "link_failed", `${p.label} didn't send a sign-in code. Link it again.`);
  if (!CALLBACK(p.id).test(redirectUri)) throw new AppError(400, "link_failed", "That sign-in came back to the wrong address.");
  if (p.oauth.pkce && !verifier) throw new AppError(400, "link_failed", "That sign-in expired. Link it again.");
  const t = await tokenRequest(p, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    ...(p.oauth.pkce ? { code_verifier: verifier } : {}),
  });
  const who = await p.identify(t);
  await ctx.rpc("link_save_connection", {
    p_provider: p.id,
    p_external_id: who.externalId,
    p_display_name: who.displayName,
    p_access_token: t.access_token,
    p_refresh_token: t.refresh_token ?? null,
    p_expires_at: expiry(t),
    p_scope: t.scope ?? (typeof ctx.body.scope === "string" ? ctx.body.scope : null),
  });
  return sync(ctx, p.id);
}

/** Link a public GitHub username (checked to exist), then copy its public activity in. */
export async function linkGithub(ctx: SeriesCtx) {
  const username = (typeof ctx.body.username === "string" ? ctx.body.username : "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) throw new AppError(400, "link_failed", "That isn't a GitHub username.");
  const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, { headers: githubHeaders() });
  if (res.status === 404) throw new AppError(404, "link_not_found", `There's no GitHub user called ${username}.`);
  if (!res.ok) throw new AppError(res.status === 403 || res.status === 429 ? 429 : 502, "link_failed", "Couldn't reach GitHub. Try again.");
  const u = (await res.json()) as { id: number; login: string };
  await ctx.rpc("link_save_connection", {
    p_provider: "github",
    p_external_id: String(u.id),
    p_display_name: u.login,
    p_access_token: null,
    p_refresh_token: null,
    p_expires_at: null,
    p_scope: null,
  });
  return sync(ctx, "github");
}

type Stored = { externalId: string; displayName: string | null; accessToken: string | null; refreshToken: string | null; expiresAt: string | null; lastSyncedAt: string | null };

/** Your link, with the access token refreshed first if it runs out within five minutes. */
async function current(ctx: SeriesCtx, p: Provider): Promise<Stored> {
  const s = (await ctx.rpc("link_my_tokens", { p_provider: p.id })) as Stored | null;
  if (!s) throw new AppError(409, "link_not_connected", `Link ${p.label} first.`);
  if (!p.oauth || !s.expiresAt || Date.parse(s.expiresAt) - Date.now() > 5 * 60_000) return s;
  if (!s.refreshToken) throw new AppError(409, "link_not_connected", `${p.label} access expired. Link it again.`);
  const t = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: s.refreshToken });
  const expiresAt = expiry(t);
  await ctx.rpc("link_update_tokens", { p_provider: p.id, p_access_token: t.access_token, p_refresh_token: t.refresh_token ?? null, p_expires_at: expiresAt });
  return { ...s, accessToken: t.access_token, refreshToken: t.refresh_token ?? s.refreshToken, expiresAt };
}

/** Copy in proof from the last 60 days (or since a day before the last copy). */
export async function sync(ctx: SeriesCtx, id: string) {
  const p = provider(id);
  if (p.oauth) requireCredentials(p);
  const s = await current(ctx, p);
  const floor = Date.now() - 60 * DAY;
  const from = new Date(s.lastSyncedAt ? Math.max(floor, Date.parse(s.lastSyncedAt) - DAY) : floor);
  const rows = await p.fetch({ accessToken: s.accessToken, externalId: s.externalId, displayName: s.displayName }, from);
  const saved = await ctx.rpc("link_save_items", { p_provider: p.id, p_rows: rows });
  return { provider: p.id, synced: saved };
}

/** Unlink an app: tell it to forget Alea where it offers that (best effort), then forget everything here. */
export async function unlink(ctx: SeriesCtx, id: string) {
  const p = provider(id);
  const s = (await ctx.rpc("link_my_tokens", { p_provider: p.id })) as Stored | null;
  if (s?.accessToken && p.oauth?.revokeUrl) {
    const { url, init } = p.oauth.revokeUrl(s.accessToken);
    await fetch(url, init).catch(() => undefined);
  }
  await ctx.rpc("link_disconnect", { p_provider: p.id });
  return null;
}
