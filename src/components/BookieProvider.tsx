"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AppState, BetView, CreateBetInput, Receipt, UserView } from "@/lib/bets/types";
import CreateBetModal from "./CreateBetModal";

type Toast = { id: number; text: string; tone: "lime" | "coral" | "purple" };

type Ctx = {
  toast: (text: string, tone?: Toast["tone"]) => void;
  openCreateBet: (prefill?: string) => void;
  /** Live server state. Null until the first load finishes. */
  state: AppState | null;
  me: UserView | null;
  user: (id: string) => UserView | undefined;
  refresh: () => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  createBet: (input: CreateBetInput) => Promise<{ id: string } | null>;
  joinBet: (betId: string, outcomeId: string, amount: number) => Promise<boolean>;
  closeBet: (betId: string) => Promise<boolean>;
  settleBet: (betId: string, outcomeId: string) => Promise<{ receipt: Receipt; alreadySettled: boolean } | null>;
};

const BookieContext = createContext<Ctx | null>(null);

export function useBookie() {
  const ctx = useContext(BookieContext);
  if (!ctx) throw new Error("useBookie must be used inside <BookieProvider>");
  return ctx;
}

/** A bet's status as of right now, so a bet flips to closed the second its deadline passes. */
export function liveStatus(bet: BetView, now = Date.now()) {
  if (bet.status === "settled") return "settled";
  return now >= Date.parse(bet.deadline) ? "closed" : "open";
}

const TONE = {
  lime: "border-primary-container/50 shadow-[0_0_24px_rgba(206,76,59,0.17)]",
  coral: "border-secondary-container shadow-[0_0_24px_rgba(150,105,50,0.23)]",
  purple: "border-tertiary-container/50 shadow-[0_0_24px_rgba(127,140,232,0.17)]",
};

const POLL_MS = 4000;

export default function BookieProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [state, setState] = useState<AppState | null>(null);
  const inflight = useRef(0);

  const toast = useCallback((text: string, tone: Toast["tone"] = "lime") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const refresh = useCallback(async () => {
    // Skip polls while a mutation is in flight so a stale poll can't overwrite its result.
    if (inflight.current > 0) return;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.ok && inflight.current === 0) setState(await res.json());
    } catch {
      /* offline: keep showing the last state */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  /** POST to the API, adopt the fresh state it returns, and toast any error. */
  const post = useCallback(
    async <T,>(url: string, body?: unknown): Promise<T | null> => {
      inflight.current++;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(`⚠️ ${json?.error?.message ?? "That didn't work. Try again."}`, "coral");
          return null;
        }
        if (json.state) setState(json.state);
        return json.result as T;
      } catch {
        toast("⚠️ Can't reach the server. Check your connection.", "coral");
        return null;
      } finally {
        inflight.current--;
      }
    },
    [toast]
  );

  const switchUser = useCallback(
    async (userId: string) => {
      if ((await post("/api/session", { userId })) === null) return;
      await refresh();
    },
    [post, refresh]
  );

  const ctx: Ctx = {
    toast,
    state,
    me: state?.users.find((u) => u.id === state.me) ?? null,
    user: (id) => state?.users.find((u) => u.id === id),
    refresh,
    switchUser,
    openCreateBet: (p = "") => {
      setPrefill(p);
      setCreateOpen(true);
    },
    createBet: (input) => post<{ id: string }>("/api/bets", input),
    joinBet: async (betId, outcomeId, amount) => (await post(`/api/bets/${betId}/entries`, { outcomeId, amount })) !== null,
    closeBet: async (betId) => (await post(`/api/bets/${betId}/close`)) !== null,
    settleBet: (betId, outcomeId) => post(`/api/bets/${betId}/settle`, { outcomeId }),
  };

  return (
    <BookieContext.Provider value={ctx}>
      {children}
      {createOpen && (
        <CreateBetModal
          prefill={prefill}
          onClose={() => setCreateOpen(false)}
          onPosted={(bet) => {
            setCreateOpen(false);
            toast(`🎲 Bet posted: “${bet.proposition}”. It's in the group feed.`, "purple");
            router.push(`/bets/${bet.id}`);
          }}
        />
      )}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-sm px-4 py-3 rounded-xl bg-surface-container-high border text-on-surface font-body-md text-body-md ${TONE[t.tone]}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </BookieContext.Provider>
  );
}
