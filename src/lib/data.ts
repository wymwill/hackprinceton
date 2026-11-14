export const ME = {
  name: "Alex Chen",
  title: "The Contrarian",
  points: 1420,
  avatar:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDOeWV3t9vUJQPkILV1TjOmSrtL2qlgAPx-DuMZYXJIFhKLtfwQ3b7Oqk7cfUDX_UkSZt7IMRH2NW9bZu2C-d5eQ1VRyTBOr1gBUqkX40IeaN4EY6YXYNW7Jg4nniY-0YwLLxBxCmrN_X6EkxohTK5FgeTNgRFSirJhmbWrwYq-ATNEgG-_kSzu84U-fXG_DZWB6n44n-7GStg9S8aO8_vWYRRUCeY7bIzVu09cYxP9",
};

export type Group = { id: string; emoji: string; name: string; members: number; unread: number };

export const GROUPS: Group[] = [
  { id: "gym-arc", emoji: "🔥", name: "The Boyz Gym Arc", members: 8, unread: 0 },
  { id: "cinephiles", emoji: "🎬", name: "Sunday Cinephiles", members: 5, unread: 2 },
  { id: "grindset", emoji: "🚀", name: "Startup Grindset", members: 6, unread: 1 },
];

export const NAV = [
  { href: "/", label: "Home", icon: "local_fire_department", match: (p: string) => p === "/" },
  { href: "/bets", label: "Bets", icon: "casino", match: (p: string) => p.startsWith("/bets") || p.startsWith("/receipts") },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy", match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/profile", label: "Profile", icon: "id_card", match: (p: string) => p.startsWith("/profile") },
];

export const FRIENDS = ["Jake Miller", "Sam Vance", "Priya Sharma", "Marcus Reed", "David K.", "Elena Rostova"];

/** Toy odds model: the worse someone's track record, the longer the odds. */
export function bookieOdds(friend: string, category: string) {
  const record: Record<string, number> = {
    "Jake Miller": 0.14,
    "Sam Vance": 0.85,
    "Priya Sharma": 0.61,
    "Marcus Reed": 0.52,
    "David K.": 0.49,
    "Elena Rostova": 0.66,
  };
  const categoryBias: Record<string, number> = { Fitness: -0.04, Habits: -0.08, "Pop Culture": 0.05, Projects: -0.1 };
  const p = Math.min(0.95, Math.max(0.05, (record[friend] ?? 0.5) + (categoryBias[category] ?? 0)));
  const against = (1 - p) / p;
  const ratio = against >= 1 ? `${Math.round(against)}:1` : `1:${Math.round(1 / against)}`;
  const roasts =
    p < 0.25
      ? `${friend.split(" ")[0]} has a ${Math.round(p * 100)}% hit rate. Prove me wrong! 😄`
      : p < 0.55
        ? `Coin flip energy. ${friend.split(" ")[0]} could go either way. 🪙`
        : `${friend.split(" ")[0]} usually delivers. Betting against them is bold. 😬`;
  return { p, ratio, roast: roasts };
}
