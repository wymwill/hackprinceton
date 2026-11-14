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
  { href: "/dares", label: "Dares", icon: "warning", match: (p: string) => p.startsWith("/dares") },
  { href: "/profile", label: "Profile", icon: "id_card", match: (p: string) => p.startsWith("/profile") },
];
