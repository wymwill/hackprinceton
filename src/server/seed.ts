import "server-only";
import { baselineEstimate } from "@/lib/markets/baseline";
import type { DareSpec, Outcome, Side } from "@/lib/markets/types";
import { createGroup, joinGroup } from "./groups";
import { aiQueue, applyBookieEstimate, createMarket, postEvidence, settle, settledRecords, trade } from "./markets";
import type { Db } from "./store";

/**
 * Starting data. `demo` is a friend group with real history, so the Bookie has
 * something to reason about (Jake is 2 for 7 on fitness). `empty` is four
 * players and no groups.
 */

const empty = (): Db => ({
  version: 2,
  users: [],
  groups: [],
  memberships: [],
  markets: [],
  trades: [],
  picks: [],
  ledger: [],
  receipts: [],
  evidence: [],
  reviews: [],
  aiLog: [],
  dares: [],
  dareVotes: [],
});

const HOUR = 3600_000;
const DAY = 24 * HOUR;

type Past = {
  host: string;
  q: string;
  subject?: string;
  cat: string;
  daysAgo: number;
  trades: [string, Side, number][];
  outcome: Outcome;
  dare?: DareSpec;
  roast?: string;
};

const PAST: Past[] = [
  { host: "sam", q: "Will Jake hit the gym 4 times this week?", subject: "jake", cat: "fitness", daysAgo: 40, trades: [["alex", "no", 120], ["priya", "yes", 80]], outcome: "no", roast: "Priya believed in Jake. Priya has learned." },
  { host: "alex", q: "Will Jake run a 5K under 30 minutes?", subject: "jake", cat: "fitness", daysAgo: 35, trades: [["marcus", "no", 150], ["jake", "yes", 100]], outcome: "yes", roast: "Marcus bet against cardio and cardio won." },
  { host: "priya", q: "Will Jake make Saturday spin class?", subject: "jake", cat: "fitness", daysAgo: 30, trades: [["sam", "no", 100], ["elena", "yes", 60]], outcome: "no" },
  { host: "marcus", q: "Will Jake do 100 pushups in one day?", subject: "jake", cat: "fitness", daysAgo: 26, trades: [["alex", "no", 90], ["jake", "yes", 120]], outcome: "yes" },
  { host: "sam", q: "Will Jake make 6 AM leg day on Monday?", subject: "jake", cat: "fitness", daysAgo: 21, trades: [["priya", "no", 140], ["marcus", "yes", 70]], outcome: "no", roast: "Jake's alarm went off. Jake did not." },
  { host: "elena", q: "Will Sam be in bed by midnight all week?", subject: "sam", cat: "sleep", daysAgo: 18, trades: [["jake", "no", 80], ["alex", "yes", 100]], outcome: "yes" },
  { host: "alex", q: "Will Jake stretch every day this week?", subject: "jake", cat: "fitness", daysAgo: 14, trades: [["elena", "no", 100], ["sam", "no", 60]], outcome: "no" },
  { host: "marcus", q: "Will Priya ship her portfolio site this weekend?", subject: "priya", cat: "work", daysAgo: 10, trades: [["sam", "yes", 110], ["jake", "no", 90]], outcome: "yes" },
  { host: "priya", q: "Will Jake hit the gym on Friday night?", subject: "jake", cat: "fitness", daysAgo: 8, trades: [["jake", "yes", 150], ["alex", "no", 120]], outcome: "no", dare: { kind: "preset", text: "50 burpees on camera" }, roast: "Jake bet on himself. Bold. Wrong, but bold." },
  { host: "elena", q: "Will Marcus cook dinner 3 nights in a row?", subject: "marcus", cat: "food", daysAgo: 5, trades: [["marcus", "yes", 130], ["priya", "no", 100]], outcome: "no", dare: { kind: "custom", text: "Cook the group dinner, filmed start to finish" }, roast: "Marcus, the microwave is not a stove." },
  { host: "jake", q: "Will Elena reply to the group chat within an hour?", subject: "elena", cat: "social", daysAgo: 3, trades: [["elena", "yes", 100], ["sam", "no", 120]], outcome: "no", dare: { kind: "preset", text: "Post an apology in the chat" }, roast: "Elena read it. Elena did not reply. Classic." },
];

function demo(): Db {
  const db = empty();
  const now = Date.now();
  db.users = [
    { id: "alex", name: "Alex" },
    { id: "sam", name: "Sam" },
    { id: "priya", name: "Priya" },
    { id: "marcus", name: "Marcus" },
    { id: "elena", name: "Elena" },
    { id: "jake", name: "Jake" },
  ];
  const start = new Date(now - 60 * DAY);
  const group = createGroup(db, "alex", { name: "The Boyz Gym Arc", emoji: "🔥", mode: "tokens", startingBalance: 1000 }, start, "demo");
  for (const u of db.users.slice(1)) joinGroup(db, u.id, group.inviteCode, start);

  for (const p of PAST) {
    const t0 = now - p.daysAgo * DAY;
    const m = createMarket(db, p.host, group.id, { question: p.q, subjectId: p.subject, category: p.cat, deadline: new Date(t0 + 12 * HOUR).toISOString(), dare: p.dare }, new Date(t0));
    p.trades.forEach(([u, side, amount], i) => trade(db, u, m.id, { action: "buy", side, amount }, new Date(t0 + (i + 1) * HOUR)));
    const r = settle(db, m, p.outcome, new Date(t0 + 13 * HOUR));
    if (p.roast) r.roast = p.roast;
    r.roastSource = "stock";
  }

  // One dare in each column: the newest is still owed, then waiting on votes, then done.
  const dares = [...db.dares].sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  const [todo, voting, done] = [dares.find((d) => d.owedBy === "elena"), dares.find((d) => d.owedBy === "marcus"), dares.find((d) => d.owedBy === "jake")];
  if (todo) Object.assign(todo, { status: "todo", dueAt: new Date(now + 30 * HOUR).toISOString() });
  if (voting) Object.assign(voting, { status: "voting", dueAt: new Date(now + 20 * HOUR).toISOString(), proof: { text: "Made pasta for six. Video in the chat.", at: new Date(now - 2 * HOUR).toISOString() } });
  if (done) Object.assign(done, { status: "done", proof: { text: "50 burpees, filmed. Never again.", at: new Date(now - 6 * DAY).toISOString() } });
  if (voting) db.dareVotes.push({ dareId: voting.id, userId: voting.owedTo[0], vote: "approve" });

  const bookie = (marketId: string, subject: string, subjectName: string, cat: string, at: number) => {
    const base = baselineEstimate({ category: cat, subjectId: subject, subjectName, history: settledRecords(db, group.id) });
    applyBookieEstimate(db, marketId, { ...base, source: "baseline", at: new Date(at).toISOString() });
  };

  // Open markets.
  const t1 = now - 5 * HOUR;
  const legDay = createMarket(
    db,
    "sam",
    group.id,
    { question: "Will Jake make 6 AM leg day tomorrow?", rule: "Gym check in before 6:15 AM", subjectId: "jake", category: "fitness", deadline: new Date(now + 20 * HOUR).toISOString(), dare: { kind: "preset", text: "50 burpees on camera" } },
    new Date(t1)
  );
  bookie(legDay.id, "jake", "Jake", "fitness", t1 + 60_000);
  trade(db, "priya", legDay.id, { action: "buy", side: "yes", amount: 150 }, new Date(t1 + HOUR));
  trade(db, "marcus", legDay.id, { action: "buy", side: "no", amount: 220 }, new Date(t1 + 2 * HOUR));
  trade(db, "alex", legDay.id, { action: "buy", side: "no", amount: 90 }, new Date(t1 + 3 * HOUR));

  const t2 = now - 30 * HOUR;
  const demoDay = createMarket(
    db,
    "priya",
    group.id,
    { question: "Will Elena demo her side project by Friday?", rule: "Live demo on a call with at least 3 of us", subjectId: "elena", category: "work", deadline: new Date(now + 3 * DAY).toISOString(), dare: { kind: "wheel" } },
    new Date(t2)
  );
  bookie(demoDay.id, "elena", "Elena", "work", t2 + 60_000);
  trade(db, "alex", demoDay.id, { action: "buy", side: "yes", amount: 100 }, new Date(t2 + 2 * HOUR));
  trade(db, "jake", demoDay.id, { action: "buy", side: "no", amount: 160 }, new Date(t2 + 5 * HOUR));

  // Closed, with evidence waiting for review.
  const t3 = now - 7 * DAY;
  const dessert = createMarket(
    db,
    "alex",
    group.id,
    { question: "Did Marcus skip dessert all week?", rule: "No dessert Monday through Sunday", subjectId: "marcus", category: "food", deadline: new Date(now - 2 * HOUR).toISOString(), dare: { kind: "preset", text: "Wear a shirt the group picks" } },
    new Date(t3)
  );
  bookie(dessert.id, "marcus", "Marcus", "food", t3 + 60_000);
  trade(db, "sam", dessert.id, { action: "buy", side: "yes", amount: 100 }, new Date(t3 + HOUR));
  trade(db, "jake", dessert.id, { action: "buy", side: "no", amount: 140 }, new Date(t3 + 2 * HOUR));
  trade(db, "priya", dessert.id, { action: "buy", side: "no", amount: 80 }, new Date(t3 + 3 * HOUR));
  postEvidence(db, "marcus", dessert.id, { kind: "text", text: "Not a single dessert since Monday. Ask my fridge.", claims: "yes" }, new Date(now - HOUR));
  postEvidence(db, "jake", dessert.id, { kind: "text", text: "Food log for Saturday: cheesecake, one slice.", claims: "no", app: "Food log" }, new Date(now - 40 * 60_000));

  aiQueue().length = 0;
  return db;
}

function emptySeed(): Db {
  const db = empty();
  db.users = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, name: `Player ${n}` }));
  return db;
}

export const seed = (kind: "demo" | "empty") => (kind === "empty" ? emptySeed() : demo());
