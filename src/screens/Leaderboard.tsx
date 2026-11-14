"use client";

import Link from "next/link";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { useBookie } from "@/components/BookieProvider";
import { initials } from "@/lib/bets/format";
import type { UserView } from "@/lib/bets/types";

type Tab = "week" | "season" | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "week", label: "This Week" },
  { id: "season", label: "Balance" },
  { id: "all", label: "All-Time Net" },
];
const POOL_LABEL: Record<Tab, string> = { week: "WEEK NET", season: "BALANCE", all: "ALL-TIME NET" };

type Row = {
  id: string;
  name: string;
  initials: string;
  avatar?: string;
  me?: boolean;
  title: string;
  titleTone: "lime" | "coral" | "purple" | "plain" | "shame";
  tone: "top" | "me" | "plain" | "shame";
  points: Record<Tab, number>;
  win: number;
  record: string;
  streak: number;
  streakLabel: string;
  atRisk: number;
};

const TITLE_TONES = ["lime", "purple", "coral"] as const;

/** Leaderboard rows from live balances and settled bets, ranked by the selected tab. */
function toRows(users: UserView[], me: string, tab: Tab): Row[] {
  const sorted = [...users]
    .map((u) => ({
      u,
      points: { week: u.stats.netWeek, season: u.balance, all: u.stats.net },
    }))
    .sort((a, b) => b.points[tab] - a.points[tab] || b.u.balance - a.u.balance);
  return sorted.map(({ u, points }, i) => {
    const last = i === sorted.length - 1 && sorted.length > 3;
    const s = u.stats.streak;
    return {
      id: u.id,
      name: u.name,
      initials: initials(u.name),
      avatar: u.avatar,
      me: u.id === me,
      title: u.title,
      titleTone: last ? "shame" : (TITLE_TONES[i] ?? "plain"),
      tone: last ? "shame" : u.id === me ? "me" : i === 0 ? "top" : "plain",
      points,
      win: u.stats.settled ? Math.round((u.stats.wins / u.stats.settled) * 100) : 0,
      record: `${u.stats.wins}-${u.stats.losses}`,
      streak: s,
      streakLabel: s === 0 ? "–" : s > 0 ? `${s >= 3 ? "🔥 " : ""}${s}W` : `${s <= -3 ? "💀 " : ""}${-s}L`,
      atRisk: u.atRisk,
    };
  });
}

const ROW_STYLE = {
  top: { row: "hover:bg-surface-container transition-colors", rank: "bg-primary/10 text-primary" },
  me: { row: "bg-surface-container/80 hover:bg-surface-container transition-colors shadow-sm", rank: "bg-surface-bright text-on-surface" },
  plain: { row: "hover:bg-surface-container transition-colors", rank: "bg-surface-container-high text-on-surface-variant" },
  shame: { row: "bg-secondary-container/10 hover:bg-secondary-container/20 transition-colors", rank: "bg-secondary-container text-on-secondary-container" },
};
const TITLE_STYLE = {
  lime: "bg-surface-container-highest text-primary",
  coral: "bg-secondary-container/30 text-on-secondary-container",
  purple: "bg-tertiary-container/20 text-tertiary",
  plain: "bg-surface-container-high text-on-surface-variant",
  shame: "bg-secondary-container text-on-secondary-container font-bold shadow-[0_0_8px_rgba(190,60,90,0.2)]",
};

export default function Leaderboard() {
  const { toast, state } = useBookie();
  const [tab, setTab] = useState<Tab>("season");
  const rows = state ? toRows(state.users, state.me, tab) : [];

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop py-space-lg">
      <div className="flex flex-col w-full pb-space-xl">
        {/* Top Banner / Control Bar */}
        {" "}
        <section className="flex flex-col xl:flex-row xl:items-end justify-between gap-space-md mb-space-xl">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs text-primary font-label-md">
              <span className="material-symbols-outlined text-sm">
                military_tech
              </span>
              {" "}
              <span className="tracking-widest uppercase">
                The Boyz Gym Arc
              </span>
            </div>
            {" "}
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              🏆 Leaderboard
            </h1>
            {" "}
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Who called it, and who owes a dare.
            </p>
          </div>
          {" "}
          {/* Segmented Time Filter Controls */}
          {" "}
          <div className="inline-flex p-1 rounded-xl bg-surface-container-lowest self-start xl:self-auto shadow-inner">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-space-md py-space-xs rounded-lg font-label-md text-label-md transition-all ${
                  tab === t.id
                    ? "bg-primary-container text-on-primary-container font-bold shadow-[0_0_14px_rgba(52,211,153,0.2)]"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>
        {" "}
        {/* The Podium: top 3 from live standings */}
        <Podium rows={rows} tab={tab} />
        {" "}
        {/* Bottom Section: Ranked Table (~65%) & Rivalries/Roasts (~35%) */}
        {" "}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg w-full items-start">
          {/* Left Column: Full Group Rankings Table */}
          {" "}
          <div className="lg:col-span-8 flex flex-col gap-space-sm">
            <div className="flex items-center justify-between px-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary">
                  format_list_numbered
                </span>
                {" "}
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Everyone in the group
                </h2>
              </div>
              {" "}
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {rows.length} friends
              </span>
            </div>
            {" "}
            {/* Rankings Table Card */}
            {" "}
            <div className="w-full bg-surface-container-low rounded-2xl p-space-sm shadow-xl overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[620px]">
                <thead>
                  <tr className="bg-surface-container-lowest/60 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-3 px-space-sm rounded-l-lg">
                      Rank
                    </th>
                    <th className="py-3 px-space-sm">
                      Friend
                    </th>
                    <th className="py-3 px-space-sm">
                      Title
                    </th>
                    <th className="py-3 px-space-sm text-right">
                      Points
                    </th>
                    <th className="py-3 px-space-sm text-center">
                      Win %
                    </th>
                    <th className="py-3 px-space-sm text-center">
                      Streak
                    </th>
                    <th className="py-3 px-space-sm rounded-r-lg text-right">
                      In play
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y-0">
                  {rows.map((r, i) => (
                    <tr key={r.id} className={ROW_STYLE[r.tone].row}>
                      <td className="py-3 px-space-sm font-label-md text-label-md font-bold">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${ROW_STYLE[r.tone].rank}`}>#{i + 1}</span>
                      </td>
                      <td className="py-3 px-space-sm">
                        <div className="flex items-center gap-space-xs">
                          <Avatar name={r.name} src={r.avatar} size={28} />
                          <span className={`font-headline-sm text-sm font-bold ${r.tone === "shame" ? "text-secondary" : "text-on-surface"}`}>
                            {r.name}
                            {r.me && <span className="text-primary font-mono text-xs"> (You)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-space-sm">
                        <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-medium whitespace-nowrap ${TITLE_STYLE[r.titleTone]}`}>{r.title}</span>
                      </td>
                      <td className={`py-3 px-space-sm text-right font-label-md text-label-md font-bold ${r.tone === "shame" ? "text-secondary" : "text-on-surface"}`}>
                        {r.points[tab].toLocaleString()}
                      </td>
                      <td className="py-3 px-space-sm text-center">
                        <span className={`font-label-md text-label-md font-bold ${r.win >= 70 ? "text-primary" : r.win < 30 && r.record !== "0-0" ? "text-secondary" : "text-on-surface"}`}>{r.win}%</span>
                        <span className="text-[10px] text-on-surface-variant"> ({r.record})</span>
                      </td>
                      <td className="py-3 px-space-sm text-center">
                        <span className={`font-label-sm text-label-sm font-semibold whitespace-nowrap ${r.streak < 0 ? "text-secondary" : r.streak > 0 ? "text-primary" : "text-on-surface-variant"}`}>{r.streakLabel}</span>
                      </td>
                      <td className="py-3 px-space-sm text-right font-label-sm text-label-sm font-bold text-on-surface-variant">
                        {r.atRisk ? `${r.atRisk.toLocaleString()} pts` : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {" "}
            {/* Quick Dare Settlement Notification */}
            {" "}
            <div className="p-space-sm rounded-xl bg-surface-container-high/60 flex items-center justify-between mt-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary text-sm">
                  local_police
                </span>
                {" "}
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Jake owes 3 dares. They're due Sunday night.
                </span>
              </div>
              {" "}
              <button onClick={() => toast("📹 Video proof demanded from Jake. The squad has been notified.", "coral")} className="px-space-sm py-1 rounded-lg bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold hover:brightness-110 transition-all cursor-pointer">
                Nudge Jake
              </button>
            </div>
          </div>
          {" "}
          {/* Right Column: Fierce Rivalries & AI Bookie Roast (~35%) */}
          {" "}
          <div className="lg:col-span-4 flex flex-col gap-space-md">
            {/* Rivalries Header */}
            {" "}
            <div className="flex items-center justify-between px-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="text-base">
                  ⚔️
                </span>
                {" "}
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Rivalries
                </h2>
              </div>
              {" "}
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Head to head
              </span>
            </div>
            {" "}
            {/* Rivalry Card 1: Sam vs Alex */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container-low flex flex-col gap-space-sm shadow-md hover:bg-surface-container transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold text-sm">
                    Sam Vance
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    vs
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-primary font-bold text-sm">
                    Alex Chen
                  </span>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded-full font-mono">
                  14 Matchups
                </span>
              </div>
              {" "}
              <div className="flex items-center justify-between font-label-md text-label-md">
                <span className="text-on-surface font-bold">
                  8 Wins
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  Head to Head: 8–6
                </span>
                {" "}
                <span className="text-primary font-bold">
                  6 Wins
                </span>
              </div>
              {" "}
              {/* Mini Bar Comparison */}
              {" "}
              <div className="w-full h-2.5 rounded-full bg-surface-container-lowest overflow-clip flex">
                <div className="h-full bg-surface-bright" style={{ width: "57.1%" }}></div>
                {" "}
                <div className="h-full bg-primary-container shadow-[0_0_8px_rgba(52,211,153,0.3)]" style={{ width: "42.9%" }}></div>
              </div>
              {" "}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Alex won the last two.
              </p>
            </div>
            {" "}
            {/* Rivalry Card 2: Marcus vs Jake */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container-low flex flex-col gap-space-sm shadow-md hover:bg-surface-container transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold text-sm">
                    Marcus Reed
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    vs
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-secondary font-bold text-sm">
                    Jake Miller
                  </span>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-bold">
                  Lopsided
                </span>
              </div>
              {" "}
              <div className="flex items-center justify-between font-label-md text-label-md">
                <span className="text-on-surface font-bold">
                  11 Wins
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  Head to Head: 11–2
                </span>
                {" "}
                <span className="text-secondary font-bold">
                  2 Wins
                </span>
              </div>
              {" "}
              {/* Mini Bar Comparison */}
              {" "}
              <div className="w-full h-2.5 rounded-full bg-surface-container-lowest overflow-clip flex">
                <div className="h-full bg-primary shadow-[0_0_8px_rgba(119,255,147,0.5)]" style={{ width: "84.6%" }}></div>
                {" "}
                <div className="h-full bg-secondary-container" style={{ width: "15.4%" }}></div>
              </div>
              {" "}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Marcus is up 800 pts this season.
              </p>
            </div>
            {" "}
            {/* AI Bookie's Power Ranking Roast Card */}
            {" "}
            <div className="p-space-md rounded-2xl bg-gradient-to-br from-tertiary-container/15 via-surface-container-low to-surface-container-low flex flex-col gap-space-xs relative overflow-clip shadow-[0_0_24px_rgba(167,139,250,0.1)]">
              <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-tertiary-container/10 blur-xl pointer-events-none rounded-full"></div>
              {" "}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="text-lg">
                    🤖
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-tertiary font-bold tracking-wider">
                    AI Bookie
                  </span>
                </div>
                {" "}
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse shadow-[0_0_8px_rgba(211,189,255,0.8)]"></span>
              </div>
              {" "}
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1">
                Weekly roast
              </h3>
              {" "}
              <p className="font-body-md text-body-md text-tertiary italic leading-relaxed">
                “Never bet on Jake before 9 AM.”
              </p>
              {" "}
              <div className="mt-2 pt-2 flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  Next roast in 14 hrs
                </span>
                {" "}
                <Link href="/" className="font-label-sm text-label-sm text-tertiary font-bold hover:underline cursor-pointer flex items-center gap-0.5">
                  See all{" "}
                  <span className="material-symbols-outlined text-xs">
                    arrow_forward
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
      {" "}
    </main>
  );
}

const MEDAL = [
  { order: "order-1 md:order-2 -mt-4", badge: "CHAMPION", rank: "Rank #1", size: 96 },
  { order: "order-2 md:order-1", badge: "SILVER", rank: "Rank #2", size: 80 },
  { order: "order-3 md:order-3", badge: "BRONZE", rank: "Rank #3", size: 80 },
];

/** Top three friends, champion in the middle. */
function Podium({ rows, tab }: { rows: Row[]; tab: Tab }) {
  return (
    <section className="relative w-full mb-space-xl pt-space-lg">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md items-end max-w-5xl mx-auto">
        {rows.slice(0, 3).map((r, i) => {
          const m = MEDAL[i];
          const first = i === 0;
          return (
            <div key={r.id} className={`${m.order} flex flex-col items-center group`}>
              <div className="relative mb-3 flex flex-col items-center">
                {first ? (
                  <div className="w-10 h-10 rounded-full bg-tertiary-container/30 flex items-center justify-center text-xl mb-1 shadow-[0_0_24px_rgba(211,189,255,0.7)] animate-bounce">
                    👑
                  </div>
                ) : (
                  <span className="px-space-xs py-0.5 rounded-full bg-surface-bright text-on-surface font-label-sm text-label-sm uppercase tracking-wider mb-2 font-bold shadow-sm">
                    {m.rank}
                  </span>
                )}
                <div
                  className={`relative rounded-2xl overflow-clip p-1 ${
                    first
                      ? "bg-gradient-to-tr from-primary via-tertiary to-primary-container shadow-[0_0_30px_rgba(52,211,153,0.23)]"
                      : "bg-gradient-to-b from-surface-bright via-surface-container to-surface-container-low shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  <Avatar name={r.name} src={r.avatar} size={m.size - 8} className="rounded-xl!" />
                </div>
                <span
                  className={`absolute -bottom-2 px-2 py-0.5 rounded-md font-label-sm text-label-sm font-bold shadow ${
                    first ? "bg-primary-container text-on-primary rounded-full" : "bg-surface-container-highest text-on-surface"
                  }`}
                >
                  {m.badge}
                </span>
              </div>
              <div
                className={`w-full rounded-t-2xl p-space-md flex flex-col items-center text-center shadow-lg transition-transform group-hover:-translate-y-1 ${
                  first ? "bg-surface-container pb-space-lg" : "bg-surface-container-low"
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">{r.name}</span>
                  {r.me && <span className="font-label-sm text-label-sm text-primary font-bold">(You)</span>}
                </div>
                <span className="font-label-md text-label-md text-secondary-fixed-dim uppercase tracking-wider mt-0.5">{r.title}</span>
                <div className="my-space-sm w-full py-1.5 px-3 rounded-lg bg-surface-container-lowest flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">{POOL_LABEL[tab]}</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {tab !== "season" && r.points[tab] > 0 ? "+" : ""}
                    {r.points[tab].toLocaleString()} <span className="text-xs text-primary font-mono">PTS</span>
                  </span>
                </div>
                <div className="w-full grid grid-cols-2 gap-1 text-left">
                  <div className="p-1.5 rounded bg-surface-container-high/60 flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">WIN RATE</span>
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      {r.win}% <span className="text-[10px] text-on-surface-variant">({r.record})</span>
                    </span>
                  </div>
                  <div className="p-1.5 rounded bg-surface-container-high/60 flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">STREAK</span>
                    <span className={`font-label-md text-label-md font-bold ${r.streak < 0 ? "text-secondary" : "text-primary"}`}>{r.streakLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
