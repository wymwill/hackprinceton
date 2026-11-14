"use client";

import Link from "next/link";
import { useState } from "react";
import { useBookie } from "@/components/BookieProvider";
import Countdown from "@/components/Countdown";

type Pick = null | "pack" | "jake" | "pass";

export default function BetDetail() {
  const { toast } = useBookie();
  const [pick, setPick] = useState<Pick>(null);
  const [side, setSide] = useState<Record<string, string>>({});
  const pool = 2450 + (pick === "pack" || pick === "jake" ? 250 : 0);

  const choose = (p: Exclude<Pick, null>) => {
    setPick(p);
    if (p === "pack") toast("✅ Locked: 250 PTS on The Pack. Bookie: “Easiest money of your life.”", "lime");
    if (p === "jake") toast("🚀 Contrarian play: 250 PTS on Jake at 6x. Bookie: “Love the optimism.”", "purple");
    if (p === "pass") toast("🪑 You're sitting this one out. No pressure, there is always the next one.", "purple");
  };

  const sideBet = (row: string, who: string) => {
    setSide((s) => ({ ...s, [row]: who }));
    toast(`🤝 Side bet placed: backing ${who}.`, "lime");
  };

  const pickBtn = (row: string, who: string, tone: "primary" | "secondary") => (
    <button
      onClick={() => sideBet(row, who)}
      disabled={!!side[row]}
      className={`px-2 py-1 rounded-md font-label-sm text-label-sm font-bold transition-all ${
        side[row] === who
          ? tone === "primary"
            ? "bg-primary-container text-on-primary"
            : "bg-secondary-container text-on-secondary-container"
          : side[row]
            ? "opacity-30 bg-surface-container-highest text-on-surface-variant"
            : "bg-surface-container-highest text-on-surface hover:bg-surface-bright"
      }`}
    >
      {side[row] === who ? `✓ ${who}` : `Back ${who}`}
    </button>
  );

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop py-space-lg">
      <div className="flex flex-col w-full pb-space-xl">
        {/* Top Navigation & Meta Header */}
        {" "}
        <div className="flex flex-wrap items-center justify-between gap-space-sm mb-space-lg">
          <div className="flex items-center gap-space-xs font-label-md text-label-md text-on-surface-variant">
            <Link href="/bets" className="hover:text-primary transition-colors">
              Bets
            </Link>
            {" "}
            <span>
              /
            </span>
            {" "}
            <Link href="/" className="hover:text-primary transition-colors">
              The Boyz Gym Arc
            </Link>
            {" "}
            <span>
              /
            </span>
            {" "}
            <span className="text-primary font-bold">
              #BET-8842
            </span>
          </div>
          {" "}
          <div className="flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className=" absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75"></span>
              {" "}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            {" "}
            <span className="font-label-sm text-label-sm text-primary tracking-wider uppercase font-semibold">
              ACTIVE • CLOSES IN <Countdown seconds={13335} />
            </span>
          </div>
        </div>
        {" "}
        {/* Master Split Screen Layout (62% Left / 38% Right Desktop) */}
        {" "}
        <div className="grid grid-cols-1 lg:grid-cols-[62fr_38fr] gap-gutter-desktop items-start">
          {/* LEFT COLUMN (62% Desktop) */}
          {" "}
          <div className="flex flex-col gap-space-lg min-w-0">
            {/* Bet Hero Title Container */}
            {" "}
            <div className="p-space-lg rounded-xl bg-surface-container shadow-md flex flex-col gap-space-sm relative overflow-clip">
              <div className="flex flex-wrap items-center justify-between gap-space-xs">
                <span className="font-label-sm text-label-sm px-space-sm py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-medium">
                  🏋️ Fitness / Morning Routine
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-secondary-fixed-dim bg-secondary-container/20 px-space-xs py-0.5 rounded-md">
                  Odds moving fast
                </span>
              </div>
              {" "}
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight leading-tight">
                Will Jake make 6 AM leg day without snoozing?
              </h1>
              {" "}
              <div className="flex items-center gap-space-md pt-space-xs font-label-md text-label-md text-on-surface-variant">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-primary">
                    groups
                  </span>
                  {" "}6 friends betting
                </span>
                {" "}
                <span>
                  •
                </span>
                {" "}
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-tertiary">
                    toll
                  </span>
                  {" "}Pool: {pool.toLocaleString()} PTS
                </span>
                {" "}
                <span>
                  •
                </span>
                {" "}
                <span className="text-secondary font-semibold">
                  Loser's dare: dye beard pink
                </span>
              </div>
            </div>
            {" "}
            {/* Settlement Criteria Card */}
            {" "}
            <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-sm shadow-sm">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-base">
                  verified
                </span>
                {" "}
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                  How this bet gets decided
                </span>
              </div>
              {" "}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                <div className="p-space-sm rounded-lg bg-surface-container flex flex-col gap-1">
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                    Jake wins if
                  </span>
                  {" "}
                  <p className="font-body-sm text-body-sm text-on-surface">
                    Gym check-in at{" "}
                    <span className="text-primary font-semibold">
                      Equinox Downtown
                    </span>
                    {" "}by 6:15 AM.
                  </p>
                </div>
                {" "}
                <div className="p-space-sm rounded-lg bg-surface-container flex flex-col gap-1">
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                    How we check
                  </span>
                  {" "}
                  <p className="font-body-sm text-body-sm text-on-surface">
                    His fitness app, or a group vote.
                  </p>
                </div>
              </div>
            </div>
            {" "}
            {/* Action & Primary Odds Slate */}
            {" "}
            <div className="p-space-lg rounded-xl bg-surface-container-high shadow-xl flex flex-col gap-space-md relative overflow-clip">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
                <div className="flex flex-col gap-1">
                  <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Current odds
                  </span>
                  {" "}
                  <div className="flex items-baseline gap-space-xs">
                    <span className="font-display-lg text-display-lg font-bold text-on-surface tracking-tighter">
                      6.00
                    </span>
                    {" "}
                    <span className="font-label-lg text-label-lg text-secondary-fixed-dim font-bold">
                      pays 6x
                    </span>
                    {" "}
                    <span className="font-body-sm text-body-sm text-on-surface-variant pl-space-xs">
                      if you back Jake
                    </span>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-xs pt-1 font-label-sm text-label-sm text-on-surface-variant">
                    <span>
                      Chance:
                    </span>
                    {" "}
                    <span className="text-secondary font-bold">
                      14% yes
                    </span>
                    {" "}
                    <span>
                      /
                    </span>
                    {" "}
                    <span className="text-primary font-bold">
                      86% no
                    </span>
                  </div>
                </div>
                {" "}
                {/* Split Odds Ratio Bar */}
                {" "}
                <div className="flex flex-col gap-1 w-full md:w-56">
                  <div className="flex justify-between font-label-sm text-label-sm">
                    <span className="text-primary font-bold">
                      No 86%
                    </span>
                    {" "}
                    <span className="text-secondary font-bold">
                      Yes 14%
                    </span>
                  </div>
                  {" "}
                  <div className="h-2.5 w-full bg-surface-container-lowest rounded-full overflow-clip flex">
                    <div className="h-full bg-primary-container shadow-[0_0_12px_rgba(206,76,59,0.25)] transition-all duration-500" style={{ width: "85.7%" }}></div>
                    {" "}
                    <div className="h-full bg-secondary-container shadow-[0_0_12px_rgba(150,105,50,0.2)] transition-all duration-500" style={{ width: "14.3%" }}></div>
                  </div>
                </div>
              </div>
              {" "}
              {/* Wagering Interactive Actions */}
              {" "}
              <div className="flex flex-col gap-space-sm pt-space-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <button onClick={() => choose("pack")} disabled={pick !== null} className={`flex items-center justify-center gap-space-xs py-space-md px-space-lg rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_24px_rgba(206,76,59,0.17)] hover:shadow-[0_0_32px_rgba(206,76,59,0.3)] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:hover:scale-100 ${pick && pick !== "pack" ? "opacity-40 shadow-none" : ""}`}>
                    <span>
                      {pick === "pack" ? "Taken · 250 PTS on The Pack" : "Take the Bet"}
                    </span>
                    {" "}
                    <span className="material-symbols-outlined text-xl">
                      {pick === "pack" ? "check_circle" : "trending_up"}
                    </span>
                  </button>
                  {" "}
                  <button onClick={() => (pick === "pass" ? setPick(null) : choose("pass"))} disabled={pick === "pack" || pick === "jake"} className={`flex items-center justify-center gap-space-xs py-space-md px-space-lg rounded-xl bg-surface-container-highest text-on-surface hover:text-primary hover:bg-surface-bright font-headline-sm text-headline-sm font-semibold transition-all disabled:opacity-40 disabled:hover:text-on-surface`}>
                    <span>
                      {pick === "pass" ? "Passed · Undo?" : "Pass"}
                    </span>
                    {" "}
                    <span className="material-symbols-outlined text-base">
                      do_not_disturb_on
                    </span>
                  </button>
                </div>
                {" "}
                <button onClick={() => choose("jake")} disabled={pick !== null} className={`w-full flex items-center justify-between p-space-sm rounded-lg text-secondary transition-all ${pick === "jake" ? "bg-secondary-container/50 ring-1 ring-secondary" : "bg-secondary-container/20 hover:bg-secondary-container/30"} ${pick && pick !== "jake" ? "opacity-40" : ""}`}>
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-secondary text-sm">
                      bolt
                    </span>
                    {" "}
                    <span className="font-label-md text-label-md font-bold">
                      Feeling lucky?
                    </span>
                    {" "}
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Back Jake to actually wake up
                    </span>
                  </div>
                  {" "}
                  <span className="font-label-md text-label-md font-bold text-secondary">
                    pays 6x →
                  </span>
                </button>
              </div>
            </div>
            {" "}
            {/* Odds Shift Telemetry Chart */}
            {" "}
            <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-space-md">
              <div className="flex flex-wrap items-center justify-between gap-space-xs">
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                    Odds history
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    How the odds changed overnight
                  </span>
                </div>
                {" "}
                <div className="flex items-center gap-1 bg-surface-container-lowest px-space-xs py-1 rounded-md">
                  <span className="font-label-sm text-label-sm text-secondary font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      south
                    </span>
                    {" "}Crash -3.5 pts overnight
                  </span>
                </div>
              </div>
              {" "}
              {/* Custom SVG Data Chart */}
              {" "}
              <div className="relative w-full h-48 bg-surface-container-lowest rounded-xl p-space-md overflow-clip flex flex-col justify-between">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ce4c3b_1px,transparent_1px)] [background-size:16px_16px]"></div>
                {" "}
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 130">
                  {/* Gridlines */}
                  {" "}
                  <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="600" y1="25" y2="25"></line>
                  {" "}
                  <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="600" y1="65" y2="65"></line>
                  {" "}
                  <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="600" y1="105" y2="105"></line>
                  {" "}
                  {/* Area Gradient Fill */}
                  {" "}
                  <defs>
                    <linearGradient id="crashGlow" x1="0%" x2="0%" y1="0%" y2="100%">
                      <stop offset="0%" stopColor="#e9bf86" stopOpacity="0.35"></stop>
                      {" "}
                      <stop offset="100%" stopColor="#e9bf86" stopOpacity="0.0"></stop>
                    </linearGradient>
                  </defs>
                  {" "}
                  <path d="M 0,30 L 140,32 L 280,30 L 320,60 L 410,110 L 600,118 L 600,130 L 0,130 Z" fill="url(#crashGlow)"></path>
                  {" "}
                  {/* Trajectory Path */}
                  {" "}
                  <path d="M 0,30 L 140,32 L 280,30 L 320,60 L 410,110 L 600,118" fill="none" stroke="#e9bf86" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3"></path>
                  {" "}
                  {/* Highlight Nodes */}
                  {" "}
                  <circle className="fill-primary" cx="280" cy="30" r="4"></circle>
                  {" "}
                  <circle className="fill-secondary shadow-lg animate-pulse" cx="410" cy="110" r="5"></circle>
                </svg>
                {" "}
                {/* Dynamic Timeline Callouts */}
                {" "}
                <div className="relative z-10 flex justify-between items-end pt-2">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      9:00 PM
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-primary font-bold">
                      50% chance
                    </span>
                  </div>
                  {" "}
                  <div className="hidden sm:flex flex-col items-center bg-surface-container-high px-space-xs py-0.5 rounded shadow">
                    <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                      11 PM: Jake says "I'm locked in"
                    </span>
                  </div>
                  {" "}
                  <div className="flex flex-col items-end">
                    <div className="bg-secondary-container px-space-xs py-0.5 rounded shadow-md mb-1">
                      <span className="font-label-sm text-label-sm text-on-secondary font-bold">
                        1:30 AM: still gaming
                      </span>
                    </div>
                    {" "}
                    <span className="font-label-sm text-label-sm text-secondary font-bold">
                      14% chance
                    </span>
                  </div>
                </div>
              </div>
              {" "}
            </div>
            {" "}
            {/* Backers & Side Hustles Section */}
            {" "}
            <div className="p-space-lg rounded-xl bg-surface-container flex flex-col gap-space-md shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary text-base">
                    handshake
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    Side bets
                  </span>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-surface-container-high text-on-surface-variant font-bold">
                  Pick a side
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-space-xs">
                {/* Side Bet Row 1 */}
                {" "}
                <div className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high transition-colors">
                  <div className="flex items-center gap-space-sm">
                    <div className="flex -space-x-2">
                      <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center font-label-sm text-label-sm font-bold text-primary">
                        M
                      </div>
                      {" "}
                      <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center font-label-sm text-label-sm font-bold text-secondary">
                        E
                      </div>
                    </div>
                    {" "}
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        Marcus vs Elena
                      </span>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Jake sleeps past 9 AM
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-xs">
                    <span className="font-label-md text-label-md text-primary font-bold">
                      100 PTS
                    </span>
                    {pickBtn("r1", "Marcus", "primary")}
                    {pickBtn("r1", "Elena", "secondary")}
                  </div>
                </div>
                {" "}
                {/* Side Bet Row 2 */}
                {" "}
                <div className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container-high transition-colors">
                  <div className="flex items-center gap-space-sm">
                    <div className="flex -space-x-2">
                      <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center font-label-sm text-label-sm font-bold text-tertiary">
                        D
                      </div>
                      {" "}
                      <div className="w-7 h-7 rounded-full bg-surface-container-highest flex items-center justify-center font-label-sm text-label-sm font-bold text-primary">
                        A
                      </div>
                    </div>
                    {" "}
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        Devon vs Alex
                      </span>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Jake calls in "sick" by 8 AM
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-xs">
                    <span className="font-label-md text-label-md text-primary font-bold">
                      250 PTS
                    </span>
                    {pickBtn("r2", "Devon", "primary")}
                    {pickBtn("r2", "Alex", "secondary")}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {" "}
          {/* RIGHT COLUMN (38% Desktop) */}
          {" "}
          <div className="flex flex-col gap-space-lg min-w-0">
            {/* AI Bookie Arbiter Callout Card */}
            {" "}
            <div className="p-space-lg rounded-xl bg-surface-container-high shadow-[0_0_20px_-2px_rgba(127,140,232,0.17)] flex flex-col gap-space-sm relative overflow-clip">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-bold uppercase tracking-wider">
                    AI Bookie
                  </span>
                  {" "}
                  <span className="font-label-md text-label-md text-tertiary font-semibold">
                    Why these odds?
                  </span>
                </div>
                {" "}
                <span className="material-symbols-outlined text-tertiary text-sm">
                  smart_toy
                </span>
              </div>
              {" "}
              <p className="font-body-sm text-body-sm text-on-surface italic leading-relaxed pt-space-xs">
                “Online at (
                <span className="text-tertiary font-semibold">
                  1:14 AM, mid game
                </span>
                ). Late nights mean late mornings.”
              </p>
              {" "}
              <div className="flex items-center justify-between pt-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  Based on Jake's last 9 bets
                </span>
                {" "}
                <div className="flex items-center gap-1 font-label-md text-label-md text-primary font-bold">
                  <span className="material-symbols-outlined text-sm">
                    psychology
                  </span>
                  {" "}
                  <span>
                    94% sure
                  </span>
                </div>
              </div>
            </div>
            {" "}
            {/* Connected Proof Source Badge */}
            {" "}
            <div className="p-space-md rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                  Checked automatically
                </span>
                {" "}
                <div className="flex items-center gap-1 font-label-sm text-label-sm text-primary">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  {" "}Syncing
                </div>
              </div>
              {" "}
              <div className="flex items-center gap-space-md p-space-sm rounded-lg bg-surface-container">
                <div className="flex items-center gap-space-xs text-primary">
                  <span className="material-symbols-outlined text-xl">
                    favorite
                  </span>
                  {" "}
                  <span className="material-symbols-outlined text-xl">
                    directions_run
                  </span>
                </div>
                {" "}
                <div className="flex flex-col truncate">
                  <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                    Fitness apps connected
                  </span>
                  {" "}
                  <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    Gym location check · synced 12m ago
                  </span>
                </div>
              </div>
            </div>
            {" "}
            {/* Participant Track Record: Jake */}
            {" "}
            <div className="p-space-lg rounded-xl bg-surface-container shadow-sm flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                  Jake's track record
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-secondary font-bold">
                  On the hook
                </span>
              </div>
              {" "}
              <div className="flex items-center gap-space-md">
                <img className="w-14 h-14 rounded-full object-cover shadow-md flex-shrink-0" alt="Athletic young man in gym clothes looking exhausted while scrolling on his smartphone late at night in a dimly lit apartment, cinematic dark tones with neon green accents." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAvRmbfjfIknPmvPmTbNV3zS9TbZmyb_6uSjw_JCJt_YKlhckjrXEtad0Ozfex21JLBMzEQkTWMyYwjvFCNt4iZbwyjtjfmhsSNRp1UH0UDUnTd_qOAmvW60tcK_eDSSrHTgl83wgY-NMU38DQ2P67JIBQ7DIvSHvdZWaErKzbXpk9JalcELXX5GG6HyWSuqczgWr4fuX-sgcCP6EpDSszjZqDqWwHrleC0CeiLZ1g9" />
                {" "}
                <div className="flex flex-col truncate">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold truncate">
                    Jake Miller
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-secondary-fixed-dim">
                    "The Snoozer"
                  </span>
                </div>
              </div>
              {" "}
              <div className="grid grid-cols-2 gap-space-sm">
                <div className="p-space-sm rounded-lg bg-surface-container-high flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Win Rate
                  </span>
                  {" "}
                  <span className="font-headline-md text-headline-md text-secondary font-bold">
                    22%
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    2-7 All Time
                  </span>
                </div>
                {" "}
                <div className="p-space-sm rounded-lg bg-surface-container-high flex flex-col">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Fitness Bets
                  </span>
                  {" "}
                  <span className="font-headline-md text-headline-md text-secondary font-bold">
                    6 Losses
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Last 7 challenges
                  </span>
                </div>
              </div>
              {" "}
              <div className="p-space-sm rounded-lg bg-surface-container-lowest flex items-center justify-between font-label-sm text-label-sm">
                <span className="text-on-surface-variant">
                  Says he goes:{" "}
                  <strong className="text-on-surface">
                    80%
                  </strong>
                </span>
                {" "}
                <span className="text-secondary font-bold">
                  Actually goes: 25%
                </span>
              </div>
            </div>
            {" "}
            {/* Challenger / The Pack Track Record */}
            {" "}
            <div className="p-space-lg rounded-xl bg-surface-container-low shadow-sm flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                  Who's betting no
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-primary font-bold">
                  5 friends
                </span>
              </div>
              {" "}
              <div className="flex items-center justify-between">
                <div className="flex -space-x-3">
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center font-label-md text-label-md font-bold text-primary shadow">
                    M
                  </div>
                  {" "}
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center font-label-md text-label-md font-bold text-tertiary shadow">
                    E
                  </div>
                  {" "}
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center font-label-md text-label-md font-bold text-secondary shadow">
                    D
                  </div>
                  {" "}
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center font-label-md text-label-md font-bold text-on-surface shadow">
                    A
                  </div>
                  {" "}
                  <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-sm text-label-sm font-bold shadow">
                    +1
                  </div>
                </div>
                {" "}
                <div className="flex flex-col text-right">
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">
                    78%
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    usually right
                  </span>
                </div>
              </div>
              {" "}
              <div className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant">
                <div className="flex justify-between py-1 bg-surface-container-lowest px-space-sm rounded">
                  <span>
                    Elena Vance
                  </span>
                  {" "}
                  <span className="text-primary font-semibold">
                    4-0 against Jake
                  </span>
                </div>
                {" "}
                <div className="flex justify-between py-1 bg-surface-container-lowest px-space-sm rounded">
                  <span>
                    Marcus Sterling
                  </span>
                  {" "}
                  <span className="text-primary font-semibold">
                    3-1 against Jake
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
