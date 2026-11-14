"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AppState, BookieEstimate, DareSpec, MemberView, Review, Side, UserView } from "@/lib/markets/types";
import { useHydrated } from "@/lib/format";
import CreateGroupModal from "./CreateGroupModal";
import JoinGroupModal from "./JoinGroupModal";
import NewMarketModal from "./NewMarketModal";

type Toast = { id: number; text: string; tone: "ok" | "warn" | "bookie" };
type Modal = null | "create-group" | "join-group" | "new-market";

export type NewMarketInput = { question: string; rule?: string; deadline: string; chance?: number; dare?: DareSpec; subjectId?: string; category?: string };

type Ctx = {
  state: AppState | null;
  groupId: string | null;
  setGroupId: (id: string | null) => void;
  me: UserView | null;
  member: MemberView | null;
  name: (userId: string) => string;
  navOpen: boolean;
  setNavOpen: (v: boolean) => void;
  open: (m: Modal) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  refresh: () => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  createGroup: (input: { name: string; emoji: string; mode: "tokens" | "points"; startingBalance?: number }) => Promise<{ id: string } | null>;
  joinGroup: (code: string) => Promise<{ id: string } | null>;
  updateGroup: (patch: Record<string, unknown>) => Promise<boolean>;
  createMarket: (input: NewMarketInput) => Promise<{ id: string } | null>;
  trade: (marketId: string, action: "buy" | "sell", side: Side, amount: number) => Promise<{ contracts: number; amount: number } | null>;
  pick: (marketId: string, side: Side) => Promise<boolean>;
  closeMarket: (marketId: string) => Promise<boolean>;
  postEvidence: (marketId: string, body: { text: string; claims?: Side } | FormData) => Promise<boolean>;
  askBookie: (marketId: string) => Promise<Review | null>;
  recheckOdds: (marketId: string) => Promise<BookieEstimate | null>;
  proposeResult: (marketId: string, outcome: "yes" | "no" | "void") => Promise<boolean>;
  vote: (marketId: string, vote: "confirm" | "dispute") => Promise<boolean>;
  suggestDare: (question: string, rule?: string) => Promise<{ text: string } | null>;
  postDareProof: (dareId: string, body: { text: string } | FormData) => Promise<boolean>;
  voteDare: (dareId: string, vote: "approve" | "redo") => Promise<boolean>;
};

const AppContext = createContext<Ctx | null>(null);

/**
 * App state and actions. Live data is held back until hydration finishes, so
 * parts of the page that hydrate late (inside Suspense) still match the server HTML.
 */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  const hydrated = useHydrated();
  return hydrated ? ctx : { ...ctx, state: null, me: null, member: null };
}

const POLL_MS = 4000;

const TONE = {
  ok: "border-primary-container/50",
  warn: "border-secondary-container",
  bookie: "border-tertiary-container/60",
};

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const inflight = useRef(0);
  const groupRef = useRef<string | null>(null);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (inflight.current > 0 && !force) return;
    const g = groupRef.current;
    try {
      const res = await fetch(`/api/state${g ? `?group=${encodeURIComponent(g)}` : ""}`, { cache: "no-store" });
      if (groupRef.current !== g) return;
      if (res.ok) setState(await res.json());
      else if (res.status === 404 && g) {
        // Not in that group (for example after switching who you're playing as).
        const r2 = await fetch("/api/state", { cache: "no-store" });
        if (r2.ok) setState(await r2.json());
      }
    } catch {
      /* offline: keep the last state */
    }
  }, []);

  useEffect(() => {
    groupRef.current = groupId;
    const first = setTimeout(() => refresh(true), 0);
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [groupId, refresh]);

  const send = useCallback(
    async <T,>(method: string, url: string, body?: unknown): Promise<T | null> => {
      inflight.current++;
      try {
        const form = body instanceof FormData;
        const res = await fetch(url, {
          method,
          headers: form ? undefined : { "Content-Type": "application/json" },
          body: form ? body : JSON.stringify(body ?? {}),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(json?.error?.message ?? "That didn't work. Try again.", "warn");
          return null;
        }
        return json.result as T;
      } catch {
        toast("Can't reach the server. Check your connection.", "warn");
        return null;
      } finally {
        inflight.current--;
        await refresh(true);
      }
    },
    [toast, refresh]
  );
  const post = useCallback(<T,>(url: string, body?: unknown) => send<T>("POST", url, body), [send]);

  const g = state?.group?.id ?? groupId;
  const ok = (p: Promise<unknown>) => p.then((r) => r !== null);

  const ctx: Ctx = {
    state,
    groupId,
    setGroupId,
    me: state?.users.find((u) => u.id === state.me) ?? null,
    member: state?.group?.members.find((m) => m.userId === state.me) ?? null,
    name: (id) => state?.users.find((u) => u.id === id)?.name ?? "Someone",
    navOpen,
    setNavOpen,
    open: (m) => {
      setNavOpen(false);
      setModal(m);
    },
    toast,
    refresh: () => refresh(true),
    switchUser: async (userId) => {
      await post("/api/session", { userId });
    },
    createGroup: (input) => post("/api/groups", input),
    joinGroup: (code) => post("/api/groups/join", { code }),
    updateGroup: (patch) => ok(send("PATCH", `/api/groups/${g}`, patch)),
    createMarket: (input) => post(`/api/groups/${g}/markets`, input),
    trade: (marketId, action, side, amount) => post(`/api/markets/${marketId}/trade`, { action, side, amount }),
    pick: (marketId, side) => ok(post(`/api/markets/${marketId}/pick`, { side })),
    closeMarket: (marketId) => ok(post(`/api/markets/${marketId}/close`)),
    postEvidence: (marketId, body) => ok(post(`/api/markets/${marketId}/evidence`, body)),
    askBookie: (marketId) => post(`/api/markets/${marketId}/review`),
    recheckOdds: (marketId) => post(`/api/markets/${marketId}/odds`),
    proposeResult: (marketId, outcome) => ok(post(`/api/markets/${marketId}/result`, { outcome })),
    vote: (marketId, v) => ok(post(`/api/markets/${marketId}/vote`, { vote: v })),
    suggestDare: (question, rule) => post(`/api/groups/${g}/dare-suggestion`, { question, rule }),
    postDareProof: (dareId, body) => ok(post(`/api/dares/${dareId}/proof`, body)),
    voteDare: (dareId, v) => ok(post(`/api/dares/${dareId}/vote`, { vote: v })),
  };

  return (
    <AppContext.Provider value={ctx}>
      {children}
      {modal === "create-group" && (
        <CreateGroupModal
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            toast("Group created. Share the invite code from Settings.");
            router.push(`/g/${id}`);
          }}
        />
      )}
      {modal === "join-group" && (
        <JoinGroupModal
          onClose={() => setModal(null)}
          onJoined={(id) => {
            setModal(null);
            toast("You're in.");
            router.push(`/g/${id}`);
          }}
        />
      )}
      {modal === "new-market" && (
        <NewMarketModal
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            toast("Market posted. The Bookie is setting the line.", "bookie");
            router.push(`/g/${g}/m/${id}`);
          }}
        />
      )}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-sm px-4 py-3 rounded-xl bg-surface-container-high border text-on-surface font-body-md text-body-md shadow-lg ${TONE[t.tone]}`}>
            {t.text}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
