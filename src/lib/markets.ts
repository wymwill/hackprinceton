export type Category = "Fitness" | "Habits" | "Movies" | "Projects" | "Games";

export type Outcome = { label: string; chance: number; avatar?: string };

export type Market = {
  id: string;
  title: string;
  emoji: string;
  category: Category;
  /** Yes probability history, oldest first, 0..100. Last value is the current chance. */
  history: number[];
  volume: number;
  friends: number;
  comments: number;
  closesIn: string;
  /** Hours until close, used for sorting. */
  closesHours: number;
  createdDaysAgo: number;
  href?: string;
  /** Multi-outcome markets list several answers instead of Yes/No. */
  outcomes?: Outcome[];
  resolved?: { result: string; href?: string };
  bookie?: string;
  dare?: string;
};

export const MY_BALANCE = 1420;

export const MARKETS: Market[] = [
  {
    id: "jake-leg-day",
    title: "Will Jake make 6 AM leg day tomorrow without hitting snooze?",
    emoji: "🏋️",
    category: "Fitness",
    history: [52, 50, 48, 49, 47, 45, 44, 40, 34, 27, 21, 18, 16, 15, 14],
    volume: 2450,
    friends: 6,
    comments: 14,
    closesIn: "3h 48m",
    closesHours: 3.8,
    createdDaysAgo: 1,
    href: "/bets/8842",
    bookie: "Online at 1:14 AM. Odds dropped overnight.",
    dare: "Dye beard pink",
  },
  {
    id: "dave-bench",
    title: "Will Dave bench 225 lbs for 5 clean reps tonight?",
    emoji: "💪",
    category: "Fitness",
    history: [35, 36, 38, 37, 39, 40, 41, 41, 42, 42],
    volume: 640,
    friends: 4,
    comments: 5,
    closesIn: "1h 14m",
    closesHours: 1.2,
    createdDaysAgo: 0,
  },
  {
    id: "sam-water",
    title: "Will Sam drink a gallon of water before 8 PM?",
    emoji: "💧",
    category: "Habits",
    history: [60, 58, 59, 61, 57, 55, 56, 55],
    volume: 320,
    friends: 6,
    comments: 3,
    closesIn: "5h 40m",
    closesHours: 5.7,
    createdDaysAgo: 0,
  },
  {
    id: "half-marathon",
    title: "Who finishes the Brooklyn Half first?",
    emoji: "🏃",
    category: "Fitness",
    history: [50, 52, 55, 58, 60, 62],
    volume: 1880,
    friends: 7,
    comments: 22,
    closesIn: "6d",
    closesHours: 144,
    createdDaysAgo: 4,
    outcomes: [
      { label: "Sam", chance: 62 },
      { label: "Priya", chance: 30 },
      { label: "Marcus", chance: 8 },
    ],
  },
  {
    id: "oscars",
    title: "Which movie wins Best Picture in our group's Oscar pool?",
    emoji: "🎬",
    category: "Movies",
    history: [30, 34, 33, 38, 41, 44],
    volume: 1210,
    friends: 5,
    comments: 31,
    closesIn: "12d",
    closesHours: 288,
    createdDaysAgo: 9,
    outcomes: [
      { label: "The Long Drive", chance: 44 },
      { label: "Paper Lanterns", chance: 35 },
      { label: "Northbound", chance: 21 },
    ],
  },
  {
    id: "priya-ship",
    title: "Will Priya ship her side project by Friday?",
    emoji: "🚀",
    category: "Projects",
    history: [70, 68, 66, 69, 72, 74, 73, 76],
    volume: 960,
    friends: 6,
    comments: 9,
    closesIn: "2d",
    closesHours: 48,
    createdDaysAgo: 3,
  },
  {
    id: "alex-protein",
    title: "Will Alex skip the post-workout protein shake today?",
    emoji: "🥤",
    category: "Habits",
    history: [10, 12, 15, 14, 17, 18, 17],
    volume: 900,
    friends: 3,
    comments: 4,
    closesIn: "8h 12m",
    closesHours: 8.2,
    createdDaysAgo: 0,
  },
  {
    id: "marcus-commits",
    title: "Will Marcus keep his 30 day coding streak alive?",
    emoji: "💻",
    category: "Projects",
    history: [80, 82, 81, 84, 86, 88, 89],
    volume: 530,
    friends: 4,
    comments: 6,
    closesIn: "4d",
    closesHours: 96,
    createdDaysAgo: 26,
  },
  {
    id: "elden",
    title: "Will Marcus beat the final boss before Sunday?",
    emoji: "🎮",
    category: "Games",
    history: [40, 45, 47, 52, 49, 55, 58],
    volume: 410,
    friends: 5,
    comments: 12,
    closesIn: "3d",
    closesHours: 72,
    createdDaysAgo: 2,
  },
  {
    id: "sam-marathon",
    title: "Will Sam run the marathon in under 4 hours?",
    emoji: "🏅",
    category: "Fitness",
    history: [55, 58, 61, 66, 72, 80, 100],
    volume: 375,
    friends: 3,
    comments: 18,
    closesIn: "Ended",
    closesHours: 0,
    createdDaysAgo: 14,
    resolved: { result: "Yes", href: "/receipts/8704" },
  },
];

export const chanceOf = (m: Market) => m.history[m.history.length - 1];
export const changeOf = (m: Market) => chanceOf(m) - m.history[0];
/** Points you get back if you win: stake divided by the price of the side you picked. */
export const payout = (stake: number, chance: number) => Math.round(stake / Math.max(0.01, chance / 100));
