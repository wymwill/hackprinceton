"use client";

import Link from "next/link";
import { useState } from "react";
import { useBookie } from "@/components/BookieProvider";

type Tab = "week" | "season" | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "week", label: "This Week" },
  { id: "season", label: "Season 2 (Active)" },
  { id: "all", label: "All Time" },
];

type Row = {
  name: string;
  initials: string;
  avatar?: string;
  me?: boolean;
  title: string;
  titleTone: "lime" | "coral" | "purple" | "plain" | "shame";
  tone: "top" | "me" | "plain" | "shame";
  points: Record<Tab, number>;
  win: Record<Tab, number>;
  streak: string;
  streakLabel: string;
  dares: string;
};

const ROWS: Row[] = [
  { name: "Sam Vance", initials: "SV", avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuB0ObL4uTPqFS4txG6ZuRflfr9mq1Im56UOQvA01Bo965DAG63KqJlCpsX8RtLUnOi-qdU-9r5tsDfAUY3lDzdcZUK3utxNW0_Yt3VdjMzLGhE9w4dgx563d5Z8VLhxp75drECHLal3wkSwg-Cp9VLvCbSolAQAg6CseI_g-ZSldQ5me8O3Sr3h6Hpj-KJ7h03KzxQMKwx0VAqSzV8jAmyX2hQNmd42dFNFs5sILtM-", title: "The Oracle", titleTone: "lime", tone: "top", points: { week: 420, season: 3850, all: 9120 }, win: { week: 100, season: 85, all: 79 }, streak: "7W", streakLabel: "🔥 7W", dares: "0 Owed" },
  { name: "Alex Chen", initials: "AC", avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuDXqjQVEmPxVQjx8C7lhiDRONmwyDcVXEUUNnkWmgWBnlnQubK1sZr4KOLMOdPAXhkvjtlkHX3MdV2EnsE9cT-2iQ0zisSX1rmPbMAchgkzfHYqhuw3NBuYKuiF84z6qYvjDUKx3EnJPWDVfOnMRUpFt6o0YTicN9H2NrsVcExbCF0AB4YCKR8FXG_tRollUK1Yfdh49U0rMOdku-282T1uzfIoKxvc6c9jLV6OgmXJ", me: true, title: "The Contrarian", titleTone: "coral", tone: "me", points: { week: 380, season: 3210, all: 8470 }, win: { week: 75, season: 68, all: 64 }, streak: "3W", streakLabel: "🔥 3W", dares: "1 Done" },
  { name: "Priya Sharma", initials: "PS", avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuCKRmPUwUlFh7okGbu1YK0cLExx-6Mqgy7YNQG2yyKINVIXgp8iV2AEl-DFF4tmUPBIaD69s4FzCcJgL5FPyfuuMbQ-f8hO4F1siNQ51JUJ4YWH3eVLW09Im0uV1t9BQU09TQYFAJne7ehnWJ4wpe-ZtIN-iWCGRPZ8QN49Hl_lFbGbe3OeCLDhlNWMJ1tMy5e9ibBgD1S5C5MmBr0k-xUUkOSvOcxl9ChZaG0WzOwp", title: "Statistical Menace", titleTone: "purple", tone: "plain", points: { week: 310, season: 2740, all: 7010 }, win: { week: 67, season: 61, all: 63 }, streak: "1W", streakLabel: "1W", dares: "2 Done" },
  { name: "Marcus Reed", initials: "MR", title: "The Wildcard", titleTone: "plain", tone: "plain", points: { week: 290, season: 2150, all: 5880 }, win: { week: 50, season: 52, all: 55 }, streak: "1L", streakLabel: "1L", dares: "1 Owed" },
  { name: "David K.", initials: "DK", title: "Safe Bet Dave", titleTone: "plain", tone: "plain", points: { week: 150, season: 1820, all: 4200 }, win: { week: 50, season: 49, all: 51 }, streak: "2L", streakLabel: "2L", dares: "0 Owed" },
  { name: "Jake Miller", initials: "JM", title: "🤡 Delusional Optimist", titleTone: "shame", tone: "shame", points: { week: -60, season: 640, all: 1150 }, win: { week: 0, season: 21, all: 24 }, streak: "5L", streakLabel: "💀 5L Streak", dares: "3 Owed" },
];

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
  shame: "bg-secondary-container text-on-secondary-container font-bold shadow-[0_0_8px_rgba(172,0,55,0.4)]",
};

export default function Leaderboard() {
  const { toast } = useBookie();
  const [tab, setTab] = useState<Tab>("season");
  const rows = ROWS;
  const pts = (name: string) => ROWS.find((r) => r.name === name)!.points[tab].toLocaleString();

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
                THE BOYZ GYM ARC // STANDINGS FEED
              </span>
            </div>
            {" "}
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              🏆 Group Leaderboard &amp; Hall of Shame
            </h1>
            {" "}
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Where reputations are minted, stakes are violently settled, and delusional optimists are publicly archived.
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
                    ? "bg-primary-container text-on-primary-container font-bold shadow-[0_0_14px_rgba(16,230,104,0.4)]"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>
        {" "}
        {/* The Podium: Top 3 Friends Grid */}
        {" "}
        <section className="relative w-full mb-space-xl pt-space-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md items-end max-w-5xl mx-auto">
            {/* 2nd Place: Left Pedestal (Alex Chen) */}
            {" "}
            <div className="order-2 md:order-1 flex flex-col items-center group">
              <div className="relative mb-3 flex flex-col items-center">
                <span className="px-space-xs py-0.5 rounded-full bg-surface-bright text-on-surface font-label-sm text-label-sm uppercase tracking-wider mb-2 font-bold shadow-sm">
                  Rank #2
                </span>
                {" "}
                <div className="relative w-20 h-20 rounded-2xl overflow-clip p-0.5 bg-gradient-to-b from-surface-bright via-surface-container to-surface-container-low shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                  <img className="w-full h-full object-cover rounded-xl" alt="Portrait photo of Alex, a sharp young Asian male with headphones around neck smiling confidently in a high-tech athletic club gym, cinematic cool moody rim lighting and emerald neon highlights." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCU3uFX9czaIb94h9TzN0Shg7RQOlQwtGpbLE7Lei6h60pIcL3-hgPxyyb1OTanVjGHBzF-3Neb3gPczi3K-4fV3hrXjHBSEPy4hGBtY-TdEJmorWkXFRYzGMEQC3_lxobXR7f6bi9bzKmR3n2GIa8pmjSVV5lfHvFjlhIdhjFnHVnj_8qhdLq7euAfhdktXYv8AJEJxeeMXBQP67v-Ef5GPPvPgCxz1U-T6xsfdpaE" />
                </div>
                {" "}
                <span className="absolute -bottom-2 px-2 py-0.5 rounded-md bg-surface-container-highest text-on-surface font-label-sm text-label-sm font-bold shadow">
                  SILVER
                </span>
              </div>
              {" "}
              <div className="w-full bg-surface-container-low rounded-t-2xl p-space-md flex flex-col items-center text-center shadow-lg transition-transform group-hover:-translate-y-1">
                <div className="flex items-center gap-1">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Alex Chen
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-primary font-bold">
                    (You)
                  </span>
                </div>
                {" "}
                <span className="font-label-md text-label-md text-secondary-fixed-dim uppercase tracking-wider mt-0.5">
                  The Contrarian
                </span>
                {" "}
                <div className="my-space-sm w-full py-1.5 px-3 rounded-lg bg-surface-container-lowest flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {tab === "week" ? "WEEK" : tab === "all" ? "ALL-TIME" : "SEASON"} POOL
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {pts("Alex Chen")}{" "}
                    <span className="text-xs text-primary font-mono">
                      PTS
                    </span>
                  </span>
                </div>
                {" "}
                <div className="w-full grid grid-cols-2 gap-1 text-left">
                  <div className="p-1.5 rounded bg-surface-container-high/60 flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      WIN RATE
                    </span>
                    {" "}
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      68.4%{" "}
                      <span className="text-[10px] text-on-surface-variant">
                        (16-7)
                      </span>
                    </span>
                  </div>
                  {" "}
                  <div className="p-1.5 rounded bg-surface-container-high/60 flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      HOT STREAK
                    </span>
                    {" "}
                    <span className="font-label-md text-label-md text-primary font-bold flex items-center gap-0.5">
                      🔥 3 Wins
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {" "}
            {/* 1st Place: Center Pedestal (Sam Vance) */}
            {" "}
            <div className="order-1 md:order-2 flex flex-col items-center group -mt-4">
              {/* Floating Gold Halo & Crown */}
              {" "}
              <div className="relative mb-3 flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-tertiary-container/30 flex items-center justify-center text-xl mb-1 shadow-[0_0_24px_rgba(211,189,255,0.7)] animate-bounce">
                  👑
                </div>
                {" "}
                <div className="relative w-24 h-24 rounded-2xl overflow-clip p-1 bg-gradient-to-tr from-primary via-tertiary to-primary-container shadow-[0_0_30px_rgba(16,230,104,0.45)]">
                  <img className="w-full h-full object-cover rounded-xl" alt="Confident charismatic athletic man with buzzcut and sharp gaze in dark sports gym jersey standing under golden and mint green overhead stadium spotlights, hyper-realistic, dramatic rim lighting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAMGHDydx1hSfHzkHOhvbVwEb4BeK4MCPnQ68l_RCeZKQlw2xQXfrO6TtqCwuA8UhBcVMXrD4Cy4f_Vt8RnVdBJekzJwWgsWsCty-EdtucH-3q4l77DzAOdLYzBk34Hy-5orgS_5n-Ye4OMvaL2zLmCgg_lavAafAxwjSjy0QApT7UUBbjqKWwXCxy8WNOLRwvyRsYWzAlbrTjrQnnWHsaRxQdbM1eZDHfeGY3b6K1q" />
                </div>
                {" "}
                <span className="absolute -bottom-2 px-3 py-0.5 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm font-extrabold uppercase shadow-[0_0_12px_rgba(16,230,104,0.6)]">
                  CHAMPION
                </span>
              </div>
              {" "}
              <div className="w-full bg-surface-container rounded-t-2xl p-space-md pb-space-lg flex flex-col items-center text-center shadow-2xl relative overflow-clip transition-transform group-hover:-translate-y-1.5">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-primary/10 blur-2xl pointer-events-none rounded-full"></div>
                {" "}
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                  Sam Vance
                </h2>
                {" "}
                <span className="font-label-md text-label-md text-primary font-bold uppercase tracking-wider mt-0.5">
                  The Oracle
                </span>
                {" "}
                <div className="my-space-md w-full py-2 px-4 rounded-xl bg-surface-container-lowest flex items-center justify-between shadow-inner">
                  <span className="font-label-sm text-label-sm text-on-surface-variant tracking-wider uppercase">
                    REPUTATION
                  </span>
                  {" "}
                  <span className="font-headline-lg text-headline-lg text-primary font-bold">
                    {pts("Sam Vance")}{" "}
                    <span className="text-xs text-on-surface font-mono">
                      PTS
                    </span>
                  </span>
                </div>
                {" "}
                <div className="w-full grid grid-cols-2 gap-2 text-left">
                  <div className="p-2 rounded-lg bg-surface-container-high flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      WIN RATIO
                    </span>
                    {" "}
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      84.6%
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-primary font-semibold">
                      22W — 4L
                    </span>
                  </div>
                  {" "}
                  <div className="p-2 rounded-lg bg-surface-container-high flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      UNSTOPPABLE
                    </span>
                    {" "}
                    <span className="font-headline-sm text-headline-sm text-primary font-bold">
                      🔥 7 Wins
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Active Run
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {" "}
            {/* 3rd Place: Right Pedestal (Priya Sharma) */}
            {" "}
            <div className="order-3 md:order-3 flex flex-col items-center group">
              <div className="relative mb-3 flex flex-col items-center">
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider mb-2 font-bold">
                  Rank #3
                </span>
                {" "}
                <div className="relative w-20 h-20 rounded-2xl overflow-clip p-0.5 bg-gradient-to-b from-secondary-container via-surface-container to-surface-container-low shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                  <img className="w-full h-full object-cover rounded-xl" alt="Athletic South Asian woman with sleek high ponytail and intelligent focused gaze wearing black fitness gear in ambient moody violet gym locker area with soft neon studio lights." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBaTeMMEHRj8Y4FI3EfdT8pvWUdxo-raIqsWJVi8P-3ts4e-9Hy2oTlHmKrrWdU_d4nFVPtlc-kWfAKRbB89OcmkvaSfh-iFqliyflThVnVZYnoV1CYmNE-V_l2t4etEQF9NYIi0pdvztY08vA2R3JTUXd9VL6dnTNDdI9YlNneyncncc5_-UP6TXeVHUWSaCYsnz4lMMOrRftnkwoudsItEP_v2QibY-wi84DRtHld" />
                </div>
                {" "}
                <span className="absolute -bottom-2 px-2 py-0.5 rounded-md bg-surface-container-highest text-secondary-fixed-dim font-label-sm text-label-sm font-bold shadow">
                  BRONZE
                </span>
              </div>
              {" "}
              <div className="w-full bg-surface-container-low rounded-t-2xl p-space-md flex flex-col items-center text-center shadow-lg transition-transform group-hover:-translate-y-1">
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Priya Sharma
                </span>
                {" "}
                <span className="font-label-md text-label-md text-tertiary-fixed-dim uppercase tracking-wider mt-0.5">
                  Statistical Menace
                </span>
                {" "}
                <div className="my-space-sm w-full py-1.5 px-3 rounded-lg bg-surface-container-lowest flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {tab === "week" ? "WEEK" : tab === "all" ? "ALL-TIME" : "SEASON"} POOL
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {pts("Priya Sharma")}{" "}
                    <span className="text-xs text-secondary-fixed-dim font-mono">
                      PTS
                    </span>
                  </span>
                </div>
                {" "}
                <div className="w-full grid grid-cols-2 gap-1 text-left">
                  <div className="p-1.5 rounded bg-surface-container-high/60 flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      WIN RATE
                    </span>
                    {" "}
                    <span className="font-label-md text-label-md text-on-surface font-semibold">
                      61.2%{" "}
                      <span className="text-[10px] text-on-surface-variant">
                        (14-9)
                      </span>
                    </span>
                  </div>
                  {" "}
                  <div className="p-1.5 rounded bg-surface-container-high/60 flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      CURRENT FORM
                    </span>
                    {" "}
                    <span className="font-label-md text-label-md text-on-surface font-semibold flex items-center gap-0.5">
                      ⚡ 1 Win
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
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
                  Squad Leaderboard Ledger
                </h2>
              </div>
              {" "}
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                6 Contenders Synced
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
                      Bettor
                    </th>
                    <th className="py-3 px-space-sm">
                      Designation
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
                      Dares
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y-0">
                  {rows.map((r, i) => (
                    <tr key={r.name} className={ROW_STYLE[r.tone].row}>
                      <td className="py-3 px-space-sm font-label-md text-label-md font-bold">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${ROW_STYLE[r.tone].rank}`}>#{i + 1}</span>
                      </td>
                      <td className="py-3 px-space-sm">
                        <div className="flex items-center gap-space-xs">
                          <div className={`w-7 h-7 rounded-lg overflow-clip flex items-center justify-center font-label-sm font-bold ${r.tone === "shame" ? "bg-secondary-container/40 text-secondary" : "bg-surface-container-highest text-on-surface-variant"}`}>
                            {r.avatar ? <img className="w-full h-full object-cover" alt={r.name} src={r.avatar} /> : r.initials}
                          </div>
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
                        <span className={`font-label-md text-label-md font-bold ${r.win[tab] >= 70 ? "text-primary" : r.win[tab] < 30 ? "text-secondary" : "text-on-surface"}`}>{r.win[tab]}%</span>
                      </td>
                      <td className="py-3 px-space-sm text-center">
                        <span className={`font-label-sm text-label-sm font-semibold whitespace-nowrap ${r.streak.startsWith("L") || r.streak.includes("L") ? "text-secondary" : "text-primary"}`}>{r.streakLabel}</span>
                      </td>
                      <td className={`py-3 px-space-sm text-right font-label-sm text-label-sm font-bold ${r.dares.includes("Owed") && !r.dares.startsWith("0") ? "text-secondary" : r.dares.includes("Done") ? "text-primary" : "text-on-surface-variant"}`}>
                        {r.tone === "shame" ? <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-bold animate-pulse whitespace-nowrap">{r.dares}</span> : r.dares}
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
                  Penalty Rule: Jake Miller owes 3 dares. Next settlement deadline is Sunday 11:59 PM.
                </span>
              </div>
              {" "}
              <button onClick={() => toast("📹 Video proof demanded from Jake. The squad has been notified.", "coral")} className="px-space-sm py-1 rounded-lg bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold hover:brightness-110 transition-all cursor-pointer">
                Demand Video
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
                  Fierce Rivalries
                </h2>
              </div>
              {" "}
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                H2H Data
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
                <div className="h-full bg-primary-container shadow-[0_0_8px_rgba(16,230,104,0.6)]" style={{ width: "42.9%" }}></div>
              </div>
              {" "}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Alex has closed the spread with back-to-back PR deadlift prop bets this month.
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
                  The Bully Match
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
                Marcus has extracted 800 PTS and 2 public grocery store dares from Jake this season alone.
              </p>
            </div>
            {" "}
            {/* AI Bookie's Power Ranking Roast Card */}
            {" "}
            <div className="p-space-md rounded-2xl bg-gradient-to-br from-tertiary-container/15 via-surface-container-low to-surface-container-low flex flex-col gap-space-xs relative overflow-clip shadow-[0_0_24px_rgba(157,108,255,0.2)]">
              <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-tertiary-container/10 blur-xl pointer-events-none rounded-full"></div>
              {" "}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="text-lg">
                    🤖
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-tertiary font-bold tracking-wider">
                    [BOT_ARBITER // ROAST ENGINE]
                  </span>
                </div>
                {" "}
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse shadow-[0_0_8px_rgba(211,189,255,0.8)]"></span>
              </div>
              {" "}
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1">
                AI Power Ranking Roast
              </h3>
              {" "}
              <p className="font-body-md text-body-md text-tertiary italic leading-relaxed">
                “Jake's win probability has entered cryptocurrency territory. Our algorithm officially recommends betting against him on anything requiring consciousness before 9 AM.”
              </p>
              {" "}
              <div className="mt-2 pt-2 flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  Next Roast Drop: In 14 hrs
                </span>
                {" "}
                <Link href="/" className="font-label-sm text-label-sm text-tertiary font-bold hover:underline cursor-pointer flex items-center gap-0.5">
                  Roast Feed{" "}
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
