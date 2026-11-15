import { useCallback, useEffect, useState } from "react";
import { request, useStore } from "./store.tsx";
import type { Id } from "./types.ts";

/** Public GitHub account connections and proof. */
export type ProviderId = "github";

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
  github: "Public pushes and merged pull requests",
};

/** Proof kinds, in the order the bet page offers them. */
export const KINDS: { id: string; label: string }[] = [
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

const AUTO_SYNC_KEY = "bookie-github-autosync";
const STALE_MS = 30 * 60_000;

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
      setProviders(r.providers.filter((p) => p.id === "github"));
      setLinked(r.linked.filter((l) => l.provider === "github"));
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
