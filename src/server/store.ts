import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Entry, Outcome, Receipt } from "@/lib/bets/types";

/**
 * Bookie's persistence: one JSON file on disk, written atomically.
 *
 * Every read-modify-write goes through `transact`, which serializes callers on a
 * single promise chain. That makes balance checks and settlement checks atomic
 * with their writes inside this server process, which is what guards against
 * overspending and double settlement.
 *
 * Balances are never stored. They are derived from the ledger, so a balance can
 * only change through a ledger row, and every ledger row points at the bet that
 * caused it.
 */

export type User = { id: string; name: string; title: string; avatar?: string; startingBalance: number };

export type Bet = {
  id: string;
  groupId: string;
  proposition: string;
  emoji: string;
  category: string;
  dare?: string;
  outcomes: Outcome[];
  creatorId: string;
  createdAt: string;
  deadline: string;
  history: number[][];
  receiptId?: string;
};

export type LedgerRow = {
  id: string;
  userId: string;
  betId: string;
  kind: "stake" | "payout" | "refund";
  /** Signed: stakes are negative, payouts and refunds positive. */
  amount: number;
  createdAt: string;
};

export type Db = {
  version: 1;
  users: User[];
  bets: Bet[];
  entries: Entry[];
  ledger: LedgerRow[];
  receipts: Receipt[];
};

const DATA_FILE = process.env.BOOKIE_DATA_FILE ?? path.join(process.cwd(), ".data", "bookie.json");

const g = globalThis as unknown as { __bookieLock?: Promise<unknown> };

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;

async function load(): Promise<Db> {
  try {
    return JSON.parse(await readFile(/*turbopackIgnore: true*/ DATA_FILE, "utf8")) as Db;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const { seed } = await import("./seed");
    const db = seed();
    await save(db);
    return db;
  }
}

async function save(db: Db) {
  await mkdir(/*turbopackIgnore: true*/ path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(/*turbopackIgnore: true*/ tmp, JSON.stringify(db, null, 2));
  await rename(/*turbopackIgnore: true*/ tmp, DATA_FILE);
}

/**
 * Run `fn` with exclusive access to the database. If `fn` returns normally the
 * changes are written to disk; if it throws, nothing is written.
 */
export function transact<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = (g.__bookieLock ?? Promise.resolve()).then(async () => {
    const db = await load();
    const before = JSON.stringify(db);
    const result = await fn(db);
    if (JSON.stringify(db) !== before) await save(db);
    return result;
  });
  // Keep the chain alive even if this transaction fails.
  g.__bookieLock = run.catch(() => undefined);
  return run;
}

/** Read-only snapshot. Still queued behind writers so it never sees a half-applied change. */
export const read = <T>(fn: (db: Db) => T) => transact(fn);
