import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import SignIn from "../pages/SignIn.tsx";
import { supabase } from "./supabase.ts";
import type { AppState, Db, Id, Me, Series, Settings, Side } from "./types.ts";

/**
 * Talks to the Bet Series API (src/app/api/series in the Next app, rules in
 * supabase/migrations). Players sign in with Supabase Auth; every call sends
 * their access token, and the server works out who they are from it. The
 * screens render what GET /api/series/state sends and poll for other players' moves.
 */

const POLL_MS = 2500;

type Toast = { id: number; text: string; tone: "ok" | "err" };

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function token() {
  // getSession refreshes an expired access token before handing it back.
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? `The server said ${res.status}.`);
  return (data as { result: T }).result;
}

type Act = <T = unknown>(method: "POST" | "DELETE", path: string, body?: unknown, okText?: string) => Promise<T | undefined>;

export type CreateSeriesInput = { name: string; description: string; settings: Settings; questions: string[] };

const STAKE_MODE: Record<Settings["mode"], string> = { pool: "SHARED_FAVOR_POOL", pledge: "PLEDGE", money: "MONEY" };

/** One function per server action. Each resolves to the result, or undefined if a rule said no (already shown as a toast). */
function makeApi(act: Act) {
  const s = (id: Id) => `/series/${encodeURIComponent(id)}`;
  const b = (id: Id, betId: Id) => `${s(id)}/bets/${encodeURIComponent(betId)}`;
  return {
    createSeries: ({ name, description, settings: st, questions }: CreateSeriesInput, ok?: string) =>
      act<{ id: Id }>(
        "POST",
        "/series",
        {
          title: name,
          description,
          plannedBetCount: st.betCount,
          initialBankroll: st.startingCoins,
          loserCount: st.losers,
          stakeMode: STAKE_MODE[st.mode],
          questions,
          settings: {
            minContribution: st.minContribution,
            favorsPerPlayer: st.favorsPerPlayer,
            exclusivePool: st.exclusivePool,
            tiebreak: st.tiebreak,
            betCreation: st.betCreation,
            withdrawMinutes: st.withdrawMinutes,
            hostPlays: st.hostPlays,
          },
        },
        ok
      ),
    joinByCode: (code: string, ok?: string) => act<{ id: Id }>("POST", "/series/join", { code }, ok),
    joinSeries: (id: Id, ok?: string) => act("POST", `${s(id)}/join`, undefined, ok),
    leaveSeries: (id: Id, ok?: string) => act("POST", `${s(id)}/leave`, undefined, ok),
    kick: (id: Id, userId: Id, ok?: string) => act("DELETE", `${s(id)}/participants/${encodeURIComponent(userId)}`, undefined, ok),
    submitFavor: (id: Id, text: string, ok?: string) => act("POST", `${s(id)}/favors`, { description: text }, ok),
    removeFavor: (id: Id, favorId: Id, ok?: string) => act("DELETE", `${s(id)}/favors/${encodeURIComponent(favorId)}`, undefined, ok),
    agreeToFavor: (favorId: Id, consent: boolean, ok?: string) =>
      act("POST", `/series/favors/${encodeURIComponent(favorId)}/consent`, { consent }, ok),
    setReady: (id: Id, ready: boolean, ok?: string) => act("POST", `${s(id)}/ready`, { ready }, ok),
    start: (id: Id, ok?: string) => act("POST", `${s(id)}/start`, undefined, ok),
    addBet: (id: Id, question: string, ok?: string) => act("POST", `${s(id)}/bets`, { question }, ok),
    removeDraftBet: (id: Id, betId: Id, ok?: string) => act("DELETE", b(id, betId), undefined, ok),
    wager: (id: Id, betId: Id, side: Side, amount: number, ok?: string) =>
      act("POST", `${b(id, betId)}/wagers`, { outcome: side.toUpperCase(), amount }, ok),
    withdraw: (id: Id, betId: Id, ok?: string) => act("POST", `${b(id, betId)}/withdraw`, undefined, ok),
    lockBet: (id: Id, betId: Id, ok?: string) => act("POST", `${b(id, betId)}/lock`, undefined, ok),
    resolveBet: (id: Id, betId: Id, outcome: Side, ok?: string) => act("POST", `${b(id, betId)}/resolve`, { outcome: outcome.toUpperCase() }, ok),
    cancelBet: (id: Id, betId: Id, ok?: string) => act("POST", `${b(id, betId)}/cancel`, undefined, ok),
    completeSeries: (id: Id, ok?: string) => act("POST", `${s(id)}/complete`, undefined, ok),
    chooseFavor: (id: Id, loserId: Id, favorId: Id, ok?: string) => act("POST", `${s(id)}/favors/assign`, { loserId, favorId }, ok),
    respondToFavor: (assignmentId: Id, accept: boolean, ok?: string) =>
      act("POST", `/series/assignments/${encodeURIComponent(assignmentId)}/respond`, { accept }, ok),
    favorDone: (id: Id, ok?: string) => act("POST", `${s(id)}/favor-done`, undefined, ok),
  };
}

export type Api = ReturnType<typeof makeApi>;

type Store = {
  /** Every series this player is in, as the server sends them. */
  db: Db;
  me: Id;
  meUser: Me;
  name: (id: Id) => string;
  api: Api;
  toast: (text: string, tone?: Toast["tone"]) => void;
  signOut: () => void;
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

function Boot({ children }: { children: ReactNode }) {
  return (
    <div className="boot">
      <span className="brand-name">Alea</span>
      {children}
    </div>
  );
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const userId = session?.user.id;
  const userRef = useRef(userId);
  userRef.current = userId;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // A different account (or signing out) starts from nothing, never from someone else's data.
  useEffect(() => {
    setState(null);
    setError(null);
  }, [userId]);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const refresh = useCallback(async () => {
    const asked = userRef.current;
    if (!asked) return;
    try {
      const next = await request<AppState>("GET", "/series/state");
      if (userRef.current !== asked) return;
      setState(next);
      setError(null);
      setSkew(Date.parse(next.serverTime) - Date.now());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await supabase?.auth.signOut();
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const t = window.setInterval(() => !document.hidden && refresh(), POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, refresh]);

  const act = useCallback<Act>(
    async (method, path, body, okText) => {
      try {
        const result = await request<unknown>(method, path, body);
        await refresh();
        if (okText) toast(okText);
        return (result ?? true) as never;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "err");
        return undefined;
      }
    },
    [refresh, toast]
  );

  const api = useMemo(() => makeApi(act), [act]);
  const signOut = useCallback(() => {
    supabase?.auth.signOut();
  }, []);

  const value = useMemo<Store | null>(() => {
    if (!state) return null;
    const names = new Map<Id, string>();
    for (const s of state.series) for (const m of s.members) names.set(m.userId, m.name);
    names.set(state.me.id, state.me.name);
    return {
      db: { series: state.series as Series[] },
      me: state.me.id,
      meUser: state.me,
      name: (id) => names.get(id) ?? "Someone",
      api,
      toast,
      signOut,
      toasts,
      skew,
    };
  }, [state, api, toast, signOut, toasts, skew]);

  if (!supabase) {
    return (
      <Boot>
        <p className="notice" style={{ maxWidth: 520, textAlign: "left" }}>
          <b>Sign-in isn't set up yet.</b> Put <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> (the
          project's publishable / anon key) in <code>.env.local</code> at the repo root, then restart{" "}
          <code>npm run dev</code> here and in the repo root. See <code>docs/supabase-series.md</code>.
        </p>
      </Boot>
    );
  }
  if (session === undefined) {
    return (
      <Boot>
        <p className="cap">Checking sign-in…</p>
      </Boot>
    );
  }
  if (!session) return <SignIn />;

  if (!value) {
    return (
      <Boot>
        {error ? (
          <p className="notice">
            <b>{error}</b> Start the API with <code>npm run dev</code> at the repo root, then reload.
          </p>
        ) : (
          <p className="cap">Loading your series…</p>
        )}
        <button type="button" className="btn ghost sm" onClick={signOut}>
          Sign out
        </button>
      </Boot>
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
