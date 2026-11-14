import "server-only";
import { createBet, joinBet, settleBet } from "./bets";
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
  const db: Db = { version: 1, users: USERS, bets: [], entries: [], ledger: [], receipts: [] };
  const now = Date.now();
  const at = (h: number) => new Date(now + h * HOUR);
  const iso = (h: number) => at(h).toISOString();

  // Settled last week, so the leaderboard and a receipt have history.
  const marathon = createBet(
    db,
    "marcus",
    { proposition: "Will Sam run the marathon in under 4 hours?", outcomes: ["Yes", "No"], deadline: iso(-30), stake: 100, pick: 1, category: "Fitness", emoji: "🏅", dare: "Run a mile in a tutu" },
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
    { proposition: "Will Dave bench 225 lbs for 5 clean reps tonight?", outcomes: ["Yes", "No"], deadline: iso(-1), stake: 150, pick: 1, category: "Fitness", emoji: "💪", dare: "50 burpees on camera" },
    at(-6)
  );
  joinBet(db, "david", bench.id, "o1", 200, at(-5));
  joinBet(db, "elena", bench.id, "o2", 80, at(-4));
  joinBet(db, "jake", bench.id, "o1", 60, at(-3));

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
    { proposition: "Will Jake make 6 AM leg day tomorrow without hitting snooze?", outcomes: ["Yes", "No"], deadline: iso(20), stake: 100, pick: 1, category: "Fitness", emoji: "🏋️", dare: "Dye beard pink" },
    at(-2)
  );
  joinBet(db, "jake", legDay.id, "o1", 150, at(-1.5));
  joinBet(db, "priya", legDay.id, "o2", 50, at(-1));

  return db;
}
