"use client";

import { createContext, useCallback, useContext, useState } from "react";
import CreateBetModal from "./CreateBetModal";

type Toast = { id: number; text: string; tone: "lime" | "coral" | "purple" };

type Ctx = {
  toast: (text: string, tone?: Toast["tone"]) => void;
  openCreateBet: (prefill?: string) => void;
};

const BookieContext = createContext<Ctx | null>(null);

export function useBookie() {
  const ctx = useContext(BookieContext);
  if (!ctx) throw new Error("useBookie must be used inside <BookieProvider>");
  return ctx;
}

const TONE = {
  lime: "border-primary-container/50 shadow-[0_0_24px_rgba(52,211,153,0.17)]",
  coral: "border-secondary-container shadow-[0_0_24px_rgba(190,60,90,0.23)]",
  purple: "border-tertiary-container/50 shadow-[0_0_24px_rgba(167,139,250,0.17)]",
};

export default function BookieProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState("");

  const toast = useCallback((text: string, tone: Toast["tone"] = "lime") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const openCreateBet = useCallback((p = "") => {
    setPrefill(p);
    setCreateOpen(true);
  }, []);

  return (
    <BookieContext.Provider value={{ toast, openCreateBet }}>
      {children}
      {createOpen && (
        <CreateBetModal
          prefill={prefill}
          onClose={() => setCreateOpen(false)}
          onPosted={(title) => {
            setCreateOpen(false);
            toast(`🎲 Bet posted: “${title}”. The Bookie is sharpening the odds.`, "purple");
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
