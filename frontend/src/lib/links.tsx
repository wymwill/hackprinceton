import { useCallback, useEffect, useState } from "react";
import { request, useStore } from "./store.tsx";
import type { Id } from "./types.ts";

/**
 * Linked accounts: Strava, Fitbit, Oura, Whoop and Spotify (OAuth) and GitHub
 * (a public username). Your app links, syncs and unlinks with your own sign-in;
 * the server side is src/server/links.ts.
 */

export type ProviderId = "strava" | "fitbit" | "oura" | "whoop" | "spotify" | "github";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  method: "oauth" | "username";
  configured: boolean;
  authorize: { url: string; clientId: string; scope: string; pkce: boolean; params: Record<string, string> } | null;
};

export type LinkedAccount = { provider: ProviderId; displayName: string | null; connectedAt: string; lastSyncedAt: string | null; items: number };

export type ProofItem = {
  provider: ProviderId;
  id: string;
  kind: string;
  title: string | null;
  value: number;
  unit: string;
  startedAt: string;
  extras: Record<string, unknown>;
};

export type Proof = { linked: { provider: ProviderId; displayName: string | null; lastSyncedAt: string | null }[]; items: ProofItem[] };

/** What each app is for, in a few words. */
export const BLURB: Record<ProviderId, string> = {
  strava: "Runs, rides and workouts",
  fitbit: "Daily steps and sleep",
  oura: "Sleep, readiness and workouts",
  whoop: "Recovery, sleep and workouts",
  spotify: "What you've been listening to",
  github: "Public pushes and merged pull requests",
};

/** Proof kinds, in the order the bet page offers them. */
export const KINDS: { id: string; label: string }[] = [
  { id: "run", label: "Runs" },
  { id: "ride", label: "Rides" },
  { id: "walk", label: "Walks" },
  { id: "hike", label: "Hikes" },
  { id: "swim", label: "Swims" },
  { id: "workout", label: "Workouts" },
  { id: "steps_day", label: "Daily steps" },
  { id: "sleep_night", label: "Sleep" },
  { id: "readiness_day", label: "Readiness" },
  { id: "recovery_day", label: "Recovery" },
  { id: "listen", label: "Songs played" },
  { id: "push", label: "Pushes" },
  { id: "pull_request", label: "Merged pull requests" },
];
export const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;

/** "5,320 m" → "5.3 km", "95 min" → "1h 35m", and so on. */
export function measure(value: number, unit: string) {
  const v = Number(value);
  if (unit === "m") return v >= 1000 ? `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)} km` : `${Math.round(v)} m`;
  if (unit === "min") {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  if (unit === "steps") return `${Math.round(v).toLocaleString("en-US")} steps`;
  if (unit === "score") return `${Math.round(v)}`;
  if (unit === "%") return `${Math.round(v)}%`;
  if (unit === "commits") return `${v} ${v === 1 ? "commit" : "commits"}`;
  if (unit === "pushes") return `${v} ${v === 1 ? "push" : "pushes"}`;
  if (unit === "merged") return "merged";
  return `${v} ${unit}`.trim();
}

const STATE_KEY = (p: string) => `alea-link-${p}`;
const AUTO_SYNC_KEY = "alea-links-autosync";
const STALE_MS = 30 * 60_000;

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const callbackUrl = (p: ProviderId) => `${window.location.origin}/connect/${p}/callback`;

/** Send the browser to an app to approve access. It comes back to /connect/:provider/callback. */
export async function startConnect(p: ProviderInfo) {
  if (!p.authorize) return;
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const params = new URLSearchParams({
    client_id: p.authorize.clientId,
    response_type: "code",
    redirect_uri: callbackUrl(p.id),
    scope: p.authorize.scope,
    state,
    ...p.authorize.params,
  });
  let verifier = "";
  if (p.authorize.pkce) {
    verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }
  sessionStorage.setItem(STATE_KEY(p.id), JSON.stringify({ state, verifier }));
  window.location.assign(`${p.authorize.url}?${params}`);
}

/** What startConnect saved for this app, so the callback can check the answer is for this browser. Read once. */
export function takeConnectState(p: string): { state: string; verifier: string } | null {
  const raw = sessionStorage.getItem(STATE_KEY(p));
  sessionStorage.removeItem(STATE_KEY(p));
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Every app you can link and the ones you have, with link, sync and unlink. Syncs stale links once a session. */
export function useLinks() {
  const { toast } = useStore();
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the database doesn't have linked accounts yet: the apps still show, but can't be linked.
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await request<{ providers: ProviderInfo[]; linked: LinkedAccount[]; setupNeeded: string | null }>("GET", "/links");
      setProviders(r.providers);
      setLinked(r.linked);
      setSetupNeeded(r.setupNeeded ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const run = useCallback(
    async (p: ProviderId, path: string, body: unknown, ok: (r: { synced?: number }) => string | null, quiet = false) => {
      setBusy(p);
      try {
        const r = await request<{ synced?: number } | null>("POST", `/links/${p}/${path}`, body);
        const text = ok(r ?? {});
        if (text && !quiet) toast(text);
        return true;
      } catch (e) {
        if (!quiet) toast(e instanceof Error ? e.message : "Something went wrong.", "err");
        return false;
      } finally {
        setBusy(null);
        await load();
      }
    },
    [load, toast]
  );

  const label = useCallback((p: ProviderId) => providers?.find((x) => x.id === p)?.label ?? p, [providers]);
  const sync = useCallback(
    (p: ProviderId, quiet = false) =>
      run(p, "sync", undefined, (r) => (r.synced ? `Copied ${r.synced} new ${r.synced === 1 ? "item" : "items"} from ${label(p)}.` : `${label(p)} is up to date.`), quiet),
    [run, label]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Once a browser session, quietly refresh stale links so bet proof stays current.
  useEffect(() => {
    if (!providers || setupNeeded || sessionStorage.getItem(AUTO_SYNC_KEY)) return;
    sessionStorage.setItem(AUTO_SYNC_KEY, "1");
    for (const l of linked) {
      const configured = providers.find((x) => x.id === l.provider)?.configured;
      if (configured && Date.now() - (l.lastSyncedAt ? Date.parse(l.lastSyncedAt) : 0) > STALE_MS) sync(l.provider, true);
    }
  }, [providers, linked, setupNeeded, sync]);

  return {
    providers,
    linked,
    busy,
    error,
    setupNeeded,
    connect: (p: ProviderInfo) => startConnect(p),
    linkGithub: (username: string) => run("github", "exchange", { username }, (r) => `GitHub connected. Copied ${r.synced ?? 0} public ${r.synced === 1 ? "event" : "events"}.`),
    sync: (p: ProviderId) => sync(p),
    unlink: (p: ProviderId) => run(p, "disconnect", undefined, () => `${label(p)} disconnected.`),
  };
}

/** A series member's proof since a time, for a bet. */
export function useProof(seriesId: Id, userId: Id | null, since: string | null, provider: string, kind: string) {
  const [proof, setProof] = useState<Proof | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    setProof(null);
    setError(null);
    const q = new URLSearchParams({ series: seriesId, user: userId });
    if (since) q.set("since", since);
    if (provider) q.set("provider", provider);
    if (kind) q.set("kind", kind);
    request<Proof>("GET", `/links/proof?${q}`)
      .then((p) => live && setProof(p))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [seriesId, userId, since, provider, kind]);
  return { proof, error };
}
