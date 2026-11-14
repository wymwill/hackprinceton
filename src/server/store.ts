import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Q } from "@/lib/markets/lmsr";
import type { AiLogEntry, BookieEstimate, DareSpec, DareStatus, GroupMode, Outcome, Receipt, Review, Side } from "@/lib/markets/types";

/**
 * Persistence: one JSON file on disk, written atomically.
 *
 * Every read and write goes through `transact`, which serializes callers on a
 * single promise chain, so balance checks happen atomically with their writes.
 * Balances are never stored. They're the sum of a user's ledger rows in a group.
 */

export type User = {
  id: string;
  name: string;
  /** The Supabase Auth user id this app user belongs to. Unset for demo users. */
  authId?: string;
  /** Profile photo from the sign-in provider (https only). */
  avatarUrl?: string;
};

export type Group = {
  id: string;
  name: string;
  emoji: string;
  inviteCode: string;
  mode: GroupMode;
  startingBalance: number;
  darePresets: string[];
  ownerId: string;
  createdAt: string;
};

export type Membership = { groupId: string; userId: string; role: "owner" | "member"; joinedAt: string };

export type Proposal = { outcome: Outcome; by: string; at: string; reviewId?: string; votes: Record<string, "confirm" | "dispute"> };

export type Market = {
  id: string;
  groupId: string;
  question: string;
  rule?: string;
  dare?: DareSpec;
  subjectId?: string;
  category: string;
  hostId: string;
  createdAt: string;
  deadline: string;
  closedAt?: string;
  q: Q;
  history: { at: string; yes: number; source: "market" | "bookie" }[];
  tradeCount: number;
  bookie?: BookieEstimate;
  proposal?: Proposal;
  receiptId?: string;
};

export type Trade = { id: string; marketId: string; userId: string; side: Side; contracts: number; amount: number; createdAt: string };
export type Pick = { marketId: string; userId: string; side: Side; updatedAt: string };

export type LedgerRow = {
  id: string;
  groupId: string;
  userId: string;
  marketId?: string;
  kind: "grant" | "buy" | "sell" | "payout" | "refund" | "score";
  amount: number;
  createdAt: string;
};

export type StoredEvidence = {
  id: string;
  marketId: string;
  userId: string;
  kind: "text" | "image";
  text?: string;
  file?: string;
  mime?: string;
  claims?: Side;
  app?: string;
  /** Proof for a dare, stored here so the image route serves it. Not market evidence. */
  dareProof?: boolean;
  createdAt: string;
};

export type Dare = {
  id: string;
  groupId: string;
  marketId: string;
  text: string;
  owedBy: string;
  owedTo: string[];
  dueAt: string;
  status: DareStatus;
  proof?: { text?: string; evidenceId?: string; at: string };
};

export type DareVote = { dareId: string; userId: string; vote: "approve" | "redo" };

export type Db = {
  version: 2;
  users: User[];
  groups: Group[];
  memberships: Membership[];
  markets: Market[];
  trades: Trade[];
  picks: Pick[];
  ledger: LedgerRow[];
  receipts: Receipt[];
  evidence: StoredEvidence[];
  reviews: Review[];
  aiLog: AiLogEntry[];
  dares: Dare[];
  dareVotes: DareVote[];
};

const DATA_FILE = process.env.BWF_DATA_FILE ?? path.join(process.cwd(), ".data", "bwf.json");
export const UPLOAD_DIR = path.join(path.dirname(DATA_FILE), "uploads");

const g = globalThis as unknown as { __bwfLock?: Promise<unknown> };

export const newId = (prefix: string, len = 10) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, len)}`;

async function load(): Promise<Db> {
  try {
    const db = JSON.parse(await readFile(/*turbopackIgnore: true*/ DATA_FILE, "utf8")) as Db;
    if (db.version === 2) return db;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  // Missing file, or one from the old pool version: start fresh from the seed.
  const { seed } = await import("./seed");
  const db = seed(process.env.BWF_SEED === "empty" ? "empty" : "demo");
  await save(db);
  return db;
}

async function save(db: Db) {
  await mkdir(/*turbopackIgnore: true*/ path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(/*turbopackIgnore: true*/ tmp, JSON.stringify(db));
  await rename(/*turbopackIgnore: true*/ tmp, DATA_FILE);
}

/**
 * Run `fn` with exclusive access to the database. Time based changes (closing
 * windows, dare deadlines) are applied first, so every request sees them. If
 * `fn` throws, nothing is written.
 */
export function transact<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = (g.__bwfLock ?? Promise.resolve()).then(async () => {
    const db = await load();
    const before = JSON.stringify(db);
    const { sweep } = await import("./markets");
    sweep(db, new Date());
    const result = await fn(db);
    if (JSON.stringify(db) !== before) await save(db);
    return result;
  });
  g.__bwfLock = run.catch(() => undefined);
  return run;
}

export const read = <T>(fn: (db: Db) => T) => transact(fn);
