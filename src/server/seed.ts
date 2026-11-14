import "server-only";
import { addEvidence, createBet, joinBet, settleBet } from "./bets";
import type { Db, User } from "./store";

const AVATARS = {
  alex: "https://lh3.googleusercontent.com/aida-public/AB6AXuDOeWV3t9vUJQPkILV1TjOmSrtL2qlgAPx-DuMZYXJIFhKLtfwQ3b7Oqk7cfUDX_UkSZt7IMRH2NW9bZu2C-d5eQ1VRyTBOr1gBUqkX40IeaN4EY6YXYNW7Jg4nniY-0YwLLxBxCmrN_X6EkxohTK5FgeTNgRFSirJhmbWrwYq-ATNEgG-_kSzu84U-fXG_DZWB6n44n-7GStg9S8aO8_vWYRRUCeY7bIzVu09cYxP9",
  sam: "https://lh3.googleusercontent.com/aida-public/AB6AXuB0ObL4uTPqFS4txG6ZuRflfr9mq1Im56UOQvA01Bo965DAG63KqJlCpsX8RtLUnOi-qdU-9r5tsDfAUY3lDzdcZUK3utxNW0_Yt3VdjMzLGhE9w4dgx563d5Z8VLhxp75drECHLal3wkSwg-Cp9VLvCbSolAQAg6CseI_g-ZSldQ5me8O3Sr3h6Hpj-KJ7h03KzxQMKwx0VAqSzV8jAmyX2hQNmd42dFNFs5sILtM-",
  priya: "https://lh3.googleusercontent.com/aida-public/AB6AXuCKRmPUwUlFh7okGbu1YK0cLExx-6Mqgy7YNQG2yyKINVIXgp8iV2AEl-DFF4tmUPBIaD69s4FzCcJgL5FPyfuuMbQ-f8hO4F1siNQ51JUJ4YWH3eVLW09Im0uV1t9BQU09TQYFAJne7ehnWJ4wpe-ZtIN-iWCGRPZ8QN49Hl_lFbGbe3OeCLDhlNWMJ1tMy5e9ibBgD1S5C5MmBr0k-xUUkOSvOcxl9ChZaG0WzOwp",
};

const USERS: User[] = [
  { id: "alex", name: "Alex Chen", title: "The Contrarian", avatar: AVATARS.alex, startingBalance: 1420 },
  { id: "sam", name: "Sam Vance", title: "The Oracle", avatar: AVATARS.sam, startingBalance: 1500 },
  { id: "priya", name: "Priya Sharma", title: "Statistical Menace", avatar: AVATARS.priya, startingBalance: 1200 },
  { id: "marcus", name: "Marcus Reed", title: "The Wildcard", startingBalance: 1000 },
  { id: "david", name: "David K.", title: "Safe Bet Dave", startingBalance: 900 },
  { id: "elena", name: "Elena Rostova", title: "The Closer", startingBalance: 1100 },
  { id: "jake", name: "Jake Miller", title: "🙃 Eternal Optimist", startingBalance: 600 },
];

const HOUR = 3_600_000;

/** First-run data: a few bets at different points in the lifecycle so every screen has something to show. */
export function seed(): Db {
  const db: Db = { version: 1, users: USERS, bets: [], entries: [], ledger: [], receipts: [], evidence: [], reviews: [], audit: [], series: [], seriesParticipants: [] };
  const now = Date.now();
  const at = (h: number) => new Date(now + h * HOUR);
  const iso = (h: number) => at(h).toISOString();

  /** A small Yes/No bet that's already settled, so the odds model has real history to read. */
  const past = (subjectId: string, proposition: string, category: string, yes: boolean, daysAgo: number, creator: string, against: string) => {
    const t = -daysAgo * 24;
    const b = createBet(db, creator, { proposition, outcomes: ["Yes", "No"], deadline: iso(t + 10), stake: 20, pick: 1, category, subjectId }, at(t));
    joinBet(db, against, b.id, "o1", 20, at(t + 1));
    settleBet(db, creator, b.id, yes ? "o1" : "o2", at(t + 11));
  };
  // Jake: 2 of 7 early-morning gym calls.
  past("jake", "Will Jake make the 6 AM lift?", "Fitness", false, 26, "sam", "jake");
  past("jake", "Will Jake be at the gym before 6 AM Monday?", "Fitness", true, 23, "priya", "jake");
  past("jake", "Will Jake skip the snooze button and run at 5:30?", "Fitness", false, 20, "marcus", "jake");
  past("jake", "Will Jake make sunrise yoga?", "Fitness", false, 16, "sam", "elena");
  past("jake", "Will Jake hit the 6 AM spin class?", "Fitness", true, 12, "elena", "jake");
  past("jake", "Will Jake be at the gym before 6 AM Friday?", "Fitness", false, 9, "sam", "jake");
  past("jake", "Will Jake do the early leg day?", "Fitness", false, 6, "priya", "jake");
  // A few others so category base rates exist.
  past("priya", "Will Priya ship the landing page by Sunday?", "Projects", true, 18, "marcus", "priya");
  past("david", "Will Dave bench 205 for 5?", "Fitness", true, 15, "alex", "david");
  past("sam", "Will Sam read 50 pages a day for a week?", "Habits", true, 11, "jake", "sam");

  // Settled last week, so the leaderboard and a receipt have history.
  const marathon = createBet(
    db,
    "marcus",
    { proposition: "Will Sam run the marathon in under 4 hours?", outcomes: ["Yes", "No"], deadline: iso(-30), stake: 100, pick: 1, category: "Fitness", emoji: "🏅", dare: "Run a mile in a tutu", subjectId: "sam" },
    at(-120)
  );
  joinBet(db, "sam", marathon.id, "o1", 200, at(-110));
  joinBet(db, "jake", marathon.id, "o2", 120, at(-100));
  joinBet(db, "alex", marathon.id, "o1", 80, at(-90));
  settleBet(db, "marcus", marathon.id, "o1", at(-28));

  // Closed and waiting on Alex (the default user) to settle it.
  const bench = createBet(
    db,
    "alex",
    { proposition: "Will Dave bench 225 lbs for 5 clean reps tonight?", outcomes: ["Yes", "No"], deadline: iso(-1), stake: 150, pick: 1, category: "Fitness", emoji: "💪", dare: "50 burpees on camera", subjectId: "david" },
    at(-6)
  );
  joinBet(db, "david", bench.id, "o1", 200, at(-5));
  joinBet(db, "elena", bench.id, "o2", 80, at(-4));
  joinBet(db, "jake", bench.id, "o1", 60, at(-3));
  // Conflicting evidence, so a review of this bet gets flagged for a human.
  addEvidence(db, "david", bench.id, { kind: "text", text: "Hit 225 for 5 clean reps at 8:40 PM. Elena was spotting.", claimsOutcomeId: "o1" }, at(-0.8));
  addEvidence(db, "elena", bench.id, { kind: "text", text: "I spotted. Rep 4 stopped well above the chest and I touched the bar on rep 5. Not clean.", claimsOutcomeId: "o2" }, at(-0.7));

  // Open, multi-outcome.
  const half = createBet(
    db,
    "priya",
    { proposition: "Who finishes the Brooklyn Half first?", outcomes: ["Sam", "Priya", "Marcus"], deadline: iso(24 * 6), stake: 120, pick: 1, category: "Fitness", emoji: "🏃" },
    at(-50)
  );
  joinBet(db, "sam", half.id, "o1", 200, at(-40));
  joinBet(db, "marcus", half.id, "o3", 40, at(-20));

  // Open, Yes/No, closes soon.
  const legDay = createBet(
    db,
    "sam",
    { proposition: "Will Jake make 6 AM leg day tomorrow without hitting snooze?", outcomes: ["Yes", "No"], deadline: iso(20), stake: 100, pick: 1, category: "Fitness", emoji: "🏋️", dare: "Dye beard pink", subjectId: "jake" },
    at(-2)
  );
  joinBet(db, "jake", legDay.id, "o1", 150, at(-1.5));
  joinBet(db, "priya", legDay.id, "o2", 50, at(-1));

  return db;
}
