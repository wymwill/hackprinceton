import "server-only";
import { priceYes } from "@/lib/markets/lmsr";
import type { AppState, DareView, EvidenceView, GroupView, MarketView, MemberView } from "@/lib/markets/types";
import { authMode } from "@/lib/authConfig";
import { aiStatus } from "./ai/config";
import { balanceIn, isLocked, requireMember } from "./groups";
import { chanceOf, DISPUTE_WINDOW_MS, positionsOf, statusOf, votersOf } from "./markets";
import type { Db, Market, StoredEvidence } from "./store";

/** Everything a screen needs, shaped for the client. */

const evidenceView = (e: StoredEvidence): EvidenceView => ({
  id: e.id,
  marketId: e.marketId,
  userId: e.userId,
  kind: e.kind,
  text: e.text,
  imageUrl: e.file ? `/api/evidence/${e.id}` : undefined,
  claims: e.claims,
  app: e.app,
  createdAt: e.createdAt,
});

export function marketView(db: Db, m: Market, now = Date.now()): MarketView {
  const trades = db.trades.filter((t) => t.marketId === m.id);
  return {
    id: m.id,
    groupId: m.groupId,
    question: m.question,
    rule: m.rule,
    dare: m.dare,
    subjectId: m.subjectId,
    category: m.category,
    hostId: m.hostId,
    createdAt: m.createdAt,
    deadline: m.deadline,
    status: statusOf(m, now),
    chance: chanceOf(db, m),
    q: m.q,
    tradeCount: m.tradeCount,
    bookie: m.bookie,
    volume: trades.reduce((s, t) => s + Math.abs(t.amount), 0),
    history: m.history,
    positions: positionsOf(db, m.id),
    picks: db.picks.filter((p) => p.marketId === m.id).map((p) => ({ userId: p.userId, side: p.side })),
    evidence: db.evidence.filter((e) => e.marketId === m.id && !e.dareProof).map(evidenceView),
    review: db.reviews.filter((r) => r.marketId === m.id).at(-1),
    proposal: m.proposal && {
      ...m.proposal,
      endsAt: new Date(Date.parse(m.proposal.at) + DISPUTE_WINDOW_MS).toISOString(),
      voters: votersOf(db, m),
    },
    receipt: m.receiptId ? db.receipts.find((r) => r.id === m.receiptId) : undefined,
    aiLog: db.aiLog.filter((a) => a.marketId === m.id),
  };
}

function memberViews(db: Db, groupId: string): MemberView[] {
  const markets = db.markets.filter((m) => m.groupId === groupId);
  const receipts = db.receipts.filter((r) => markets.some((m) => m.id === r.marketId)).sort((a, b) => a.settledAt.localeCompare(b.settledAt));
  return db.memberships
    .filter((ms) => ms.groupId === groupId)
    .map((ms) => {
      const user = db.users.find((u) => u.id === ms.userId)!;
      let positionValue = 0;
      for (const m of markets) {
        if (m.receiptId) continue;
        const p = positionsOf(db, m.id).find((x) => x.userId === ms.userId);
        if (p) positionValue += Math.round(p.yes * priceYes(m.q) * 100 + p.no * (1 - priceYes(m.q)) * 100);
      }
      const mine = receipts.flatMap((r) => r.results.filter((x) => x.userId === ms.userId && x.result !== "even"));
      let streak = 0;
      for (const r of [...mine].reverse()) {
        const w = r.result === "won" ? 1 : -1;
        if (streak === 0 || Math.sign(streak) === w) streak += w;
        else break;
      }
      const dares = db.dares.filter((d) => d.groupId === groupId && d.owedBy === ms.userId);
      const balance = balanceIn(db, groupId, ms.userId);
      return {
        userId: ms.userId,
        name: user.name,
        role: ms.role,
        balance,
        positionValue,
        points: balance,
        record: { wins: mine.filter((r) => r.result === "won").length, losses: mine.filter((r) => r.result === "lost").length },
        streak,
        dares: { done: dares.filter((d) => d.status === "done").length, skipped: dares.filter((d) => d.status === "skipped").length },
      };
    });
}

export function groupView(db: Db, groupId: string): GroupView {
  const g = db.groups.find((x) => x.id === groupId)!;
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    mode: g.mode,
    inviteCode: g.inviteCode,
    startingBalance: g.startingBalance,
    darePresets: g.darePresets,
    ownerId: g.ownerId,
    locked: isLocked(db, groupId),
    members: memberViews(db, groupId),
  };
}

function dareView(db: Db, d: Db["dares"][number]): DareView {
  const ev = d.proof?.evidenceId ? db.evidence.find((e) => e.id === d.proof!.evidenceId) : undefined;
  return {
    id: d.id,
    groupId: d.groupId,
    marketId: d.marketId,
    question: db.markets.find((m) => m.id === d.marketId)?.question ?? "",
    text: d.text,
    owedBy: d.owedBy,
    owedTo: d.owedTo,
    dueAt: d.dueAt,
    status: d.status,
    proof: d.proof && { text: d.proof.text, imageUrl: ev ? `/api/evidence/${ev.id}` : undefined, at: d.proof.at },
    votes: Object.fromEntries(db.dareVotes.filter((v) => v.dareId === d.id).map((v) => [v.userId, v.vote])),
  };
}

/**
 * The people you can see: yourself and anyone who shares a group with you.
 * With real accounts, nobody else's name shows up anywhere. In demo mode the
 * "Playing as" switcher needs everyone, so it gets the full list.
 */
function visibleUsers(db: Db, me: string) {
  if (authMode() === "demo") return db.users;
  const mine = new Set(db.memberships.filter((m) => m.userId === me).map((m) => m.groupId));
  const ids = new Set([me, ...db.memberships.filter((m) => mine.has(m.groupId)).map((m) => m.userId)]);
  return db.users.filter((u) => ids.has(u.id));
}

export function snapshot(db: Db, me: string, groupId?: string | null): AppState {
  const myGroups = db.memberships.filter((m) => m.userId === me).map((m) => db.groups.find((g) => g.id === m.groupId)!);
  let group: GroupView | null = null;
  if (groupId) {
    requireMember(db, me, groupId);
    group = groupView(db, groupId);
  }
  const now = Date.now();
  return {
    me,
    users: visibleUsers(db, me).map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl })),
    auth: { mode: authMode() },
    groups: myGroups.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji, mode: g.mode })),
    group,
    markets: group
      ? db.markets
          .filter((m) => m.groupId === groupId)
          .map((m) => marketView(db, m, now))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [],
    dares: group ? db.dares.filter((d) => d.groupId === groupId).map((d) => dareView(db, d)) : [],
    ai: aiStatus(),
    serverTime: new Date(now).toISOString(),
  };
}
