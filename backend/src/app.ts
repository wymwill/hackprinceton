import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  RuleError, addBet, addUser, cancelBet, chooseFavor, closeBet, createSeries, endSeries, joinByCode, joinSeries,
  kickMember, leaveSeries, markFavorDone, placeWager, removeDraftBet, removeFavor, resolveBet, setReady, startSeries,
  submitFavor, withdrawWager,
} from "./engine.ts";
import { createStore } from "./store.ts";
import type { Db, Id, Series, Side, User } from "./types.ts";

/**
 * The Bet Series API. Every write runs one engine command inside a transaction
 * and answers with { result, state }, so the screen updates from the same
 * response. Reads answer with the state the player is allowed to see.
 *
 * There is no login yet: the X-User-Id header says who is playing (the
 * "Playing as" picker). It must name an existing user for every write.
 */

export type AppState = { me: Id; users: User[]; series: Series[]; serverTime: string };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Body = Record<string, unknown>;
type Ctx = { db: Db; me: Id; params: Record<string, string>; body: Body; now: number };
type Route = { method: string; pattern: RegExp; keys: string[]; auth: boolean; handle: (c: Ctx) => unknown };

const routes: Route[] = [];
function route(method: string, pathSpec: string, handle: (c: Ctx) => unknown, auth = true) {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" + pathSpec.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), "([^/]+)")) + "$"
  );
  routes.push({ method, pattern, keys, auth, handle });
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const side = (v: unknown) => v as Side;

// Players
route("POST", "/api/users", ({ db, body }) => addUser(db, body.name), false);

// Series and lobby
route("POST", "/api/series", ({ db, me, body, now }) =>
  createSeries(db, me, {
    name: str(body.name),
    description: str(body.description),
    settings: body.settings && typeof body.settings === "object" ? (body.settings as object) : {},
    invite: Array.isArray(body.invite) ? body.invite.filter((x): x is string => typeof x === "string") : [],
  }, now)
);
route("POST", "/api/join", ({ db, me, body, now }) => joinByCode(db, me, body.code, now));
route("POST", "/api/series/:id/join", ({ db, me, params, now }) => joinSeries(db, me, params.id, now));
route("POST", "/api/series/:id/leave", ({ db, me, params, now }) => leaveSeries(db, me, params.id, now));
route("POST", "/api/series/:id/kick", ({ db, me, params, body, now }) => kickMember(db, me, params.id, str(body.userId), now));
route("POST", "/api/series/:id/favors", ({ db, me, params, body, now }) => submitFavor(db, me, params.id, body.text, now));
route("DELETE", "/api/series/:id/favors/:favorId", ({ db, me, params }) => removeFavor(db, me, params.id, params.favorId));
route("POST", "/api/series/:id/ready", ({ db, me, params, body }) => setReady(db, me, params.id, body.ready === true));
route("POST", "/api/series/:id/start", ({ db, me, params, now }) => startSeries(db, me, params.id, now));

// Bets (host)
route("POST", "/api/series/:id/bets", ({ db, me, params, body, now }) => addBet(db, me, params.id, body.question, now));
route("DELETE", "/api/series/:id/bets/:betId", ({ db, me, params }) => removeDraftBet(db, me, params.id, params.betId));
route("POST", "/api/series/:id/bets/:betId/close", ({ db, me, params, now }) => closeBet(db, me, params.id, params.betId, now));
route("POST", "/api/series/:id/bets/:betId/resolve", ({ db, me, params, body, now }) =>
  resolveBet(db, me, params.id, params.betId, side(body.outcome), now)
);
route("POST", "/api/series/:id/bets/:betId/cancel", ({ db, me, params, now }) => cancelBet(db, me, params.id, params.betId, now));
route("POST", "/api/series/:id/end", ({ db, me, params, now }) => endSeries(db, me, params.id, now));

// Wagers (players)
route("POST", "/api/series/:id/bets/:betId/wager", ({ db, me, params, body, now }) =>
  placeWager(db, me, params.id, params.betId, side(body.side), body.amount, now)
);
route("POST", "/api/series/:id/bets/:betId/withdraw", ({ db, me, params, now }) => withdrawWager(db, me, params.id, params.betId, now));

// Results
route("POST", "/api/series/:id/assignments", ({ db, me, params, body, now }) =>
  chooseFavor(db, me, params.id, str(body.loserId), str(body.favorId), now)
);
route("POST", "/api/series/:id/favor-done", ({ db, me, params, now }) => markFavorDone(db, me, params.id, now));

/** Only the series this player hosts, plays in, or was invited to. */
function stateFor(db: Db, me: Id, now: number): AppState {
  return {
    me,
    users: db.users,
    series: db.series.filter((s) => s.hostId === me || s.members.some((m) => m.userId === me)),
    serverTime: new Date(now).toISOString(),
  };
}

const MAX_BODY = 64 * 1024;
async function readBody(req: http.IncomingMessage): Promise<Body> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "That request is too large.");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Body) : {};
  } catch {
    throw new HttpError(400, "The request body isn't valid JSON.");
  }
}

function send(res: http.ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

/** Serve the built frontend (frontend/dist) so one process can run everything. Unknown paths fall back to index.html. */
function serveStatic(dir: string, urlPath: string, res: http.ServerResponse) {
  const root = path.resolve(dir);
  let file = path.resolve(root, "." + decodeURIComponent(urlPath));
  if (!file.startsWith(root + path.sep) && file !== root) return send(res, 404, { error: { message: "Not found." } });
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(root, "index.html");
  if (!existsSync(file)) return send(res, 404, { error: { message: "Not found." } });
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

export type AppOptions = { dataFile: string; allowReset?: boolean; staticDir?: string };

export function createApp({ dataFile, allowReset = false, staticDir }: AppOptions) {
  const store = createStore(dataFile);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    try {
      if (!url.pathname.startsWith("/api/")) {
        if (staticDir && (method === "GET" || method === "HEAD")) return serveStatic(staticDir, url.pathname, res);
        return send(res, 404, { error: { message: "Not found." } });
      }

      const header = req.headers["x-user-id"];
      const asked = typeof header === "string" ? header : "";

      if (method === "GET" && url.pathname === "/api/state") {
        // Unknown or missing player: fall back to the first one so the picker has something to show.
        const state = await store.transact((db) => {
          const me = db.users.some((u) => u.id === asked) ? asked : (db.users[0]?.id ?? "");
          return stateFor(db, me, Date.now());
        });
        return send(res, 200, state);
      }

      if (method === "POST" && url.pathname === "/api/reset") {
        if (!allowReset) throw new HttpError(403, "Resetting is turned off on this server.");
        await store.reset();
        const state = await store.transact((db) => stateFor(db, db.users[0]?.id ?? "", Date.now()));
        return send(res, 200, { result: null, state });
      }

      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.pattern.exec(url.pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const body = method === "GET" ? {} : await readBody(req);
        const out = await store.transact((db) => {
          const now = Date.now();
          const known = db.users.some((u) => u.id === asked);
          if (r.auth && !known) throw new HttpError(401, "Pick who you're playing as first.");
          const result = r.handle({ db, me: asked, params, body, now });
          // A new player becomes "me" for the state that comes back.
          const me = !known && result && typeof result === "object" && "id" in result ? String(result.id) : asked;
          return { result: result ?? null, state: stateFor(db, me, now) };
        });
        return send(res, method === "POST" && /\/api\/(series|users)$/.test(url.pathname) ? 201 : 200, out);
      }

      throw new HttpError(404, "There's no such API route.");
    } catch (err) {
      if (err instanceof RuleError) return send(res, 400, { error: { message: err.message } });
      if (err instanceof HttpError) return send(res, err.status, { error: { message: err.message } });
      console.error(err);
      return send(res, 500, { error: { message: "Something went wrong on the server. Try again." } });
    }
  });
}
