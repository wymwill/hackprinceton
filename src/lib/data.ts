/** Group navigation. Every page lives under /g/[groupId]. */
export const groupNav = (groupId: string) => [
  { href: `/g/${groupId}`, label: "Markets", icon: "candlestick_chart", match: (p: string) => p === `/g/${groupId}` || p.startsWith(`/g/${groupId}/m/`) },
  { href: `/g/${groupId}/leaderboard`, label: "Leaderboard", icon: "trophy", match: (p: string) => p.startsWith(`/g/${groupId}/leaderboard`) },
  { href: `/g/${groupId}/dares`, label: "Dares", icon: "local_fire_department", match: (p: string) => p.startsWith(`/g/${groupId}/dares`) },
  { href: `/g/${groupId}/settings`, label: "Settings", icon: "settings", match: (p: string) => p.startsWith(`/g/${groupId}/settings`) },
];
