import "server-only";
import type { Receipt } from "@/lib/markets/types";
import { AppError } from "./errors";
import { requireMember } from "./groups";
import { newId, type Db, type Group, type Market } from "./store";

/**
 * Dares: owed by each loser once a market settles (never for void), proven
 * with text or an image, and approved or sent back by the winners.
 */

export const DARE_WINDOW_MS = Number(process.env.BWF_DARE_WINDOW_MS ?? 48 * 3600_000);

/** Stable pick from the presets, seeded by the market id so tests are repeatable. */
export function wheelPick(presets: string[], marketId: string) {
  if (!presets.length) return undefined;
  let h = 0;
  for (const ch of marketId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return presets[h % presets.length];
}

export function createDaresFor(db: Db, market: Market, group: Group, receipt: Receipt, now: Date) {
  const spec = market.dare;
  if (!spec || spec.kind === "none") return undefined;
  const text = spec.kind === "wheel" ? wheelPick(group.darePresets, market.id) : spec.text;
  if (!text) return undefined;
  const winners = receipt.results.filter((r) => r.result === "won").map((r) => r.userId);
  for (const loser of receipt.results.filter((r) => r.result === "lost")) {
    const owedTo = winners.length
      ? winners
      : db.memberships.filter((m) => m.groupId === group.id && m.userId !== loser.userId).map((m) => m.userId);
    db.dares.push({
      id: newId("d"),
      groupId: group.id,
      marketId: market.id,
      text,
      owedBy: loser.userId,
      owedTo,
      dueAt: new Date(now.getTime() + DARE_WINDOW_MS).toISOString(),
      status: "todo",
    });
  }
  return text;
}

function requireDare(db: Db, userId: string, dareId: string) {
  const dare = db.dares.find((d) => d.id === dareId);
  if (!dare) throw new AppError(404, "dare_not_found", "That dare doesn't exist.");
  requireMember(db, userId, dare.groupId);
  return dare;
}

export function postProof(db: Db, userId: string, dareId: string, input: { text?: unknown; evidenceId?: string }, now = new Date()) {
  const dare = requireDare(db, userId, dareId);
  if (dare.owedBy !== userId) throw new AppError(403, "not_yours", "Only the person who owes this dare can post proof.");
  if (dare.status === "done" || dare.status === "skipped") throw new AppError(409, "dare_finished", "This dare is already finished.");
  const text = typeof input.text === "string" ? input.text.trim().slice(0, 300) : "";
  if (!text && !input.evidenceId) throw new AppError(400, "empty", "Add a note or a photo.");
  dare.proof = { text: text || undefined, evidenceId: input.evidenceId, at: now.toISOString() };
  dare.status = "voting";
  db.dareVotes = db.dareVotes.filter((v) => v.dareId !== dareId);
  return dare;
}

export function voteDare(db: Db, userId: string, dareId: string, vote: unknown) {
  const dare = requireDare(db, userId, dareId);
  if (!dare.owedTo.includes(userId)) throw new AppError(403, "not_owed", "Only the people this dare is owed to can vote.");
  if (dare.status !== "voting") throw new AppError(409, "not_voting", "There's no proof to vote on yet.");
  if (vote !== "approve" && vote !== "redo") throw new AppError(400, "bad_vote", "Approve or redo.");
  db.dareVotes = db.dareVotes.filter((v) => !(v.dareId === dareId && v.userId === userId));
  db.dareVotes.push({ dareId, userId, vote });
  const votes = db.dareVotes.filter((v) => v.dareId === dareId);
  const half = dare.owedTo.length / 2;
  if (votes.filter((v) => v.vote === "approve").length > half) dare.status = "done";
  else if (votes.filter((v) => v.vote === "redo").length > half) {
    dare.status = "todo";
    dare.proof = undefined;
    db.dareVotes = db.dareVotes.filter((v) => v.dareId !== dareId);
  }
  return dare;
}

/** At the deadline, proof waiting on votes counts as done and no proof counts as skipped. */
export function sweepDares(db: Db, now: Date) {
  for (const d of db.dares) {
    if (now.getTime() < Date.parse(d.dueAt)) continue;
    if (d.status === "voting") d.status = "done";
    else if (d.status === "todo") d.status = "skipped";
  }
}
