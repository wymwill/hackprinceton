import "server-only";
import { AppError } from "./errors.ts";
import type { SeriesCtx } from "./seriesApi";

/** Public GitHub activity only. Account ownership is not verified by OAuth. */
export const PROVIDERS = ["github"] as const;
export type ProviderId = (typeof PROVIDERS)[number];
export type ProofRow = { id: string; kind: string; title: string | null; value: number; unit: string; startedAt: string; extras?: Record<string, unknown> };
type Provider = { id: ProviderId; label: string; fetch: (auth: { displayName: string | null }, from: Date) => Promise<ProofRow[]> };
const DAY = 86_400_000;
function requireGithub(id: string) {
  if (id !== "github") throw new AppError(404, "unknown_provider", "Only GitHub is available.");
}
export function providersForClient() {
  return [{ id: "github" as const, label: "GitHub", method: "username" as const, configured: true, authorize: null }];
}
/** Old OAuth routes are intentionally unavailable. */
export async function exchange(_ctx: SeriesCtx, id: string): Promise<never> {
  requireGithub(id);
  throw new AppError(400, "link_failed", "GitHub connects by public username.");
}

const githubHeaders = () => ({
  "User-Agent": "Bookie",
  Accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

const github: Provider = {
  id: "github",
  label: "GitHub",
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

type Stored = { displayName: string | null; lastSyncedAt: string | null };
export async function sync(ctx: SeriesCtx, id: string) {
  requireGithub(id);
  const stored = await ctx.rpc("link_my_tokens", { p_provider: "github" }) as Stored | null;
  if (!stored) throw new AppError(409, "link_not_connected", "Connect GitHub first.");
  const floor = Date.now() - 60 * DAY;
  const from = new Date(stored.lastSyncedAt ? Math.max(floor, Date.parse(stored.lastSyncedAt) - DAY) : floor);
  const rows = await github.fetch({ displayName: stored.displayName }, from);
  return { provider: "github", synced: await ctx.rpc("link_save_items", { p_provider: "github", p_rows: rows }) };
}
export async function unlink(ctx: SeriesCtx, id: string) {
  requireGithub(id);
  await ctx.rpc("link_disconnect", { p_provider: "github" });
  return null;
}
