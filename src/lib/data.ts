/** The demo group. Every bet belongs to it (the backend's default group). */
export const GROUP = { id: "gym-arc", emoji: "🔥", name: "The Boyz Gym Arc" };

export const NAV = [
  {
    href: "/",
    label: "Markets",
    icon: "candlestick_chart",
    match: (p: string) => p === "/" || p.startsWith("/bets") || p.startsWith("/receipts"),
  },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy", match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/dares", label: "Dares", icon: "warning", match: (p: string) => p.startsWith("/dares") },
  { href: "/profile", label: "Profile", icon: "id_card", match: (p: string) => p.startsWith("/profile") },
];
