import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RuleError, seed } from "./engine.ts";
import type { Db, Id, User } from "./types.ts";

/**
 * The app's data lives in this browser (localStorage) until there's a server.
 * Every change runs an engine command on a copy, so a broken rule changes nothing.
 * Other tabs pick changes up, so two windows can play as two friends.
 */

const DB_KEY = "bwf.db.v1";
const ME_KEY = "bwf.me";

function loadDb(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as Db;
      if (db?.version === 1 && Array.isArray(db.users) && Array.isArray(db.series)) return db;
    }
  } catch {
    /* fall through to a fresh seed */
  }
  return seed();
}

function saveDb(db: Db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

function loadMe(db: Db): Id {
  try {
    const id = localStorage.getItem(ME_KEY);
    if (id && db.users.some((u) => u.id === id)) return id;
  } catch {
    /* ignore */
  }
  return db.users[0]?.id ?? "";
}

type Toast = { id: number; text: string; tone: "ok" | "err" };

type Store = {
  db: Db;
  me: Id;
  meUser: User | undefined;
  setMe: (id: Id) => void;
  user: (id: Id) => User | undefined;
  name: (id: Id) => string;
  /** Run an engine command. Returns its result, or undefined if a rule said no (shown as a toast). */
  run: <T>(fn: (db: Db, me: Id, now: number) => T, okText?: string) => T | undefined;
  toast: (text: string, tone?: Toast["tone"]) => void;
  reset: () => void;
  toasts: Toast[];
};

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside <StoreProvider>");
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(loadDb);
  const [me, setMeState] = useState<Id>(() => loadMe(db));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => saveDb(db), [db]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DB_KEY && e.newValue) {
        try {
          setDb(JSON.parse(e.newValue) as Db);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const setMe = useCallback((id: Id) => {
    setMeState(id);
    try {
      localStorage.setItem(ME_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const run = useCallback(
    <T,>(fn: (draft: Db, me: Id, now: number) => T, okText?: string): T | undefined => {
      const draft = structuredClone(dbRef.current);
      try {
        const out = fn(draft, me, Date.now());
        dbRef.current = draft;
        setDb(draft);
        if (okText) toast(okText);
        return out;
      } catch (e) {
        if (e instanceof RuleError) toast(e.message, "err");
        else {
          console.error(e);
          toast("Something went wrong. Try again.", "err");
        }
        return undefined;
      }
    },
    [me, toast]
  );

  const reset = useCallback(() => {
    const fresh = seed();
    dbRef.current = fresh;
    setDb(fresh);
    setMe(fresh.users[0].id);
    toast("Demo data reset.");
  }, [setMe, toast]);

  const value = useMemo<Store>(() => {
    const byId = new Map(db.users.map((u) => [u.id, u]));
    return {
      db,
      me,
      meUser: byId.get(me),
      setMe,
      user: (id) => byId.get(id),
      name: (id) => byId.get(id)?.name ?? "Someone",
      run,
      toast,
      reset,
      toasts,
    };
  }, [db, me, setMe, run, toast, reset, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
