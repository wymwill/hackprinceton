import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Db, Id, Series, Settings, Side, User } from "@rules/types.ts";

/**
 * Talks to the Bet Series API (backend/). The server runs every rule; the
 * screens render what it sends back and poll for other players' moves.
 * "Playing as" is remembered in this browser and sent as X-User-Id.
 */

const ME_KEY = "bwf.me";
const POLL_MS = 2500;

type AppState = { me: Id; users: User[]; series: Series[]; serverTime: string };
type Toast = { id: number; text: string; tone: "ok" | "err" };

function readMe() {
  try {
    return localStorage.getItem(ME_KEY) ?? "";
  } catch {
    return "";
  }
}

async function request<T>(method: string, path: string, me: Id, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-User-Id": me },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `The server said ${res.status}.`);
  return data as T;
}

type Act = <T = unknown>(method: "POST" | "DELETE", path: string, body?: unknown, okText?: string) => Promise<T | undefined>;

/** One function per server action. Each resolves to the result, or undefined if a rule said no (already shown as a toast). */
function makeApi(act: Act) {
  const s = (id: Id) => `/series/${encodeURIComponent(id)}`;
  const b = (id: Id, betId: Id) => `${s(id)}/bets/${encodeURIComponent(betId)}`;
  return {
    addUser: (name: string, ok?: string) => act<User>("POST", "/users", { name }, ok),
    createSeries: (input: { name: string; description: string; settings: Settings; invite: Id[] }, ok?: string) =>
      act<Series>("POST", "/series", input, ok),
    joinByCode: (code: string, ok?: string) => act<Series>("POST", "/join", { code }, ok),
    joinSeries: (id: Id, ok?: string) => act<Series>("POST", `${s(id)}/join`, undefined, ok),
    leaveSeries: (id: Id, ok?: string) => act("POST", `${s(id)}/leave`, undefined, ok),
    kick: (id: Id, userId: Id, ok?: string) => act("POST", `${s(id)}/kick`, { userId }, ok),
    submitFavor: (id: Id, text: string, ok?: string) => act("POST", `${s(id)}/favors`, { text }, ok),
    removeFavor: (id: Id, favorId: Id, ok?: string) => act("DELETE", `${s(id)}/favors/${encodeURIComponent(favorId)}`, undefined, ok),
    setReady: (id: Id, ready: boolean, ok?: string) => act("POST", `${s(id)}/ready`, { ready }, ok),
    start: (id: Id, ok?: string) => act("POST", `${s(id)}/start`, undefined, ok),
    addBet: (id: Id, question: string, ok?: string) => act("POST", `${s(id)}/bets`, { question }, ok),
    removeDraftBet: (id: Id, betId: Id, ok?: string) => act("DELETE", b(id, betId), undefined, ok),
    wager: (id: Id, betId: Id, side: Side, amount: number, ok?: string) => act("POST", `${b(id, betId)}/wager`, { side, amount }, ok),
    withdraw: (id: Id, betId: Id, ok?: string) => act("POST", `${b(id, betId)}/withdraw`, undefined, ok),
    closeBet: (id: Id, betId: Id, ok?: string) => act("POST", `${b(id, betId)}/close`, undefined, ok),
    resolveBet: (id: Id, betId: Id, outcome: Side, ok?: string) => act("POST", `${b(id, betId)}/resolve`, { outcome }, ok),
    cancelBet: (id: Id, betId: Id, ok?: string) => act("POST", `${b(id, betId)}/cancel`, undefined, ok),
    endSeries: (id: Id, ok?: string) => act("POST", `${s(id)}/end`, undefined, ok),
    chooseFavor: (id: Id, loserId: Id, favorId: Id, ok?: string) => act("POST", `${s(id)}/assignments`, { loserId, favorId }, ok),
    favorDone: (id: Id, ok?: string) => act("POST", `${s(id)}/favor-done`, undefined, ok),
  };
}

export type Api = ReturnType<typeof makeApi>;

type Store = {
  /** Everything this player can see: all users, and the series they host, play in or were invited to. */
  db: Db;
  me: Id;
  meUser: User | undefined;
  setMe: (id: Id) => void;
  user: (id: Id) => User | undefined;
  name: (id: Id) => string;
  api: Api;
  toast: (text: string, tone?: Toast["tone"]) => void;
  reset: () => void;
  toasts: Toast[];
  /** Server clock minus this browser's clock, so countdowns match the server. */
  skew: number;
};

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <StoreProvider>");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMeState] = useState<Id>(readMe);
  const [skew, setSkew] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const meRef = useRef(me);
  meRef.current = me;

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const setMe = useCallback((id: Id) => {
    meRef.current = id;
    setMeState(id);
    try {
      localStorage.setItem(ME_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const apply = useCallback(
    (next: AppState) => {
      setState(next);
      setError(null);
      setSkew(Date.parse(next.serverTime) - Date.now());
      // The server falls back to its first player when ours is unknown (for example after a reset).
      if (next.me !== meRef.current) setMe(next.me);
    },
    [setMe]
  );

  const refresh = useCallback(async () => {
    try {
      apply(await request<AppState>("GET", "/state", meRef.current));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [apply]);

  useEffect(() => {
    refresh();
  }, [me, refresh]);

  useEffect(() => {
    const t = window.setInterval(() => !document.hidden && refresh(), POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const act = useCallback<Act>(
    async (method, path, body, okText) => {
      try {
        const out = await request<{ result: unknown; state: AppState }>(method, path, meRef.current, body);
        apply(out.state);
        if (okText) toast(okText);
        return (out.result ?? true) as never;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "err");
        return undefined;
      }
    },
    [apply, toast]
  );

  const api = useMemo(() => makeApi(act), [act]);

  const reset = useCallback(async () => {
    try {
      apply((await request<{ state: AppState }>("POST", "/reset", meRef.current)).state);
      toast("Demo data reset.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't reset.", "err");
    }
  }, [apply, toast]);

  const value = useMemo<Store | null>(() => {
    if (!state) return null;
    const byId = new Map(state.users.map((u) => [u.id, u]));
    return {
      db: { version: 1, users: state.users, series: state.series },
      me: state.me,
      meUser: byId.get(state.me),
      setMe,
      user: (id) => byId.get(id),
      name: (id) => byId.get(id)?.name ?? "Someone",
      api,
      toast,
      reset,
      toasts,
      skew,
    };
  }, [state, setMe, api, toast, reset, toasts, skew]);

  if (!value) {
    return (
      <div className="boot">
        <span className="brand-name">Betting with Friends</span>
        {error ? (
          <p className="notice">
            <b>{error}</b> Start the API with <code>cd backend &amp;&amp; npm run dev</code>, then reload.
          </p>
        ) : (
          <p className="cap">Connecting…</p>
        )}
      </div>
    );
  }

  return (
    <Ctx.Provider value={value}>
      {error && (
        <div className="offline" role="status">
          {error} Showing the last data we had; retrying.
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
