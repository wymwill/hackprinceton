"use client";

import { useState } from "react";
import { useBookie } from "@/components/BookieProvider";

type Filter = "all" | "won" | "lost" | "pending";

const APPS = [
  { id: "health", name: "Apple Health", kind: "Fitness", icon: "favorite", desc: "Syncing daily step count & workouts", on: true },
  { id: "strava", name: "Strava", kind: "Fitness", icon: "pedal_bike", desc: "Syncing running & cycling activities", on: true },
  { id: "github", name: "GitHub", kind: "Code", icon: "terminal", desc: "Syncing commit streaks & PR merges", on: true },
  { id: "spotify", name: "Spotify", kind: "Music", icon: "headphones", desc: "For music listening hour bets", on: false },
  { id: "gcal", name: "Google Calendar", kind: "Calendar", icon: "event", desc: "For meeting & schedule adherence bets", on: false },
];

export default function Profile() {
  const { toast } = useBookie();
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const [apps, setApps] = useState(() => Object.fromEntries(APPS.map((a) => [a.id, a.on])) as Record<string, boolean>);
  const show = (status: Filter) => filter === "all" || filter === status;

  const toggleApp = (id: string, name: string) => {
    setApps((a) => ({ ...a, [id]: !a[id] }));
    toast(apps[id] ? `🔌 ${name} disconnected. The Bookie will need receipts from you now.` : `✅ ${name} connected. Bets can now settle automatically.`, apps[id] ? "coral" : "lime");
  };

  const shareCard = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/profile`);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop py-space-lg">
      <div className="flex flex-col w-full gap-space-lg pb-space-xl">
        {/* Profile Header Hero Card */}
        {" "}
        <section className="relative w-full rounded-2xl bg-surface-container p-space-lg overflow-clip shadow-xl">
          <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-primary-container/10 blur-3xl pointer-events-none"></div>
          {" "}
          <div className="absolute right-1/4 -bottom-24 w-72 h-72 rounded-full bg-tertiary-container/10 blur-3xl pointer-events-none"></div>
          {" "}
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-space-md min-w-0">
              <div className="relative group">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-clip bg-surface-container-highest shadow-lg p-0.5">
                  <img alt="Alex Chen profile avatar portrait" className="w-full h-full object-cover rounded-[14px]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOeWV3t9vUJQPkILV1TjOmSrtL2qlgAPx-DuMZYXJIFhKLtfwQ3b7Oqk7cfUDX_UkSZt7IMRH2NW9bZu2C-d5eQ1VRyTBOr1gBUqkX40IeaN4EY6YXYNW7Jg4nniY-0YwLLxBxCmrN_X6EkxohTK5FgeTNgRFSirJhmbWrwYq-ATNEgG-_kSzu84U-fXG_DZWB6n44n-7GStg9S8aO8_vWYRRUCeY7bIzVu09cYxP9" />
                </div>
                {" "}
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-surface-container-lowest">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary-container shadow-[0_0_8px_rgba(16,230,104,0.8)]"></span>
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-space-xs">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                    Alex Chen
                  </h1>
                  {" "}
                  <span className="font-label-md text-label-md text-on-surface-variant font-mono">
                    @alex_c
                  </span>
                  {" "}
                  <span className="px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary-container font-label-sm text-label-sm font-bold uppercase tracking-wider shadow-[0_0_12px_rgba(16,230,104,0.35)] flex items-center gap-1">
                    <span className="text-xs">
                      ⚡
                    </span>
                    {" "}The Contrarian
                  </span>
                </div>
                {" "}
                <p className="font-body-md text-body-md text-on-surface-variant max-w-xl italic mt-0.5">
                  “Always fading the consensus. If everyone says yes, I'm putting 500 on no.”
                </p>
                {" "}
                <div className="flex items-center gap-space-md mt-1 text-on-surface-variant">
                  <span className="flex items-center gap-1 font-label-sm text-label-sm font-mono">
                    <span className="material-symbols-outlined text-sm">
                      calendar_today
                    </span>
                    {" "}Member since Jan 2024
                  </span>
                  {" "}
                  <span className="flex items-center gap-1 font-label-sm text-label-sm text-primary font-mono font-semibold">
                    <span className="material-symbols-outlined text-sm">
                      token
                    </span>
                    {" "}1,420 PTS Active Bankroll
                  </span>
                </div>
              </div>
            </div>
            {" "}
            <div className="flex items-center gap-space-sm self-stretch sm:self-auto">
              <button onClick={() => toast("✏️ Profile editing is coming soon. Your title stays “The Contrarian” for now.", "purple")} className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-space-md py-2.5 rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors font-label-md text-label-md font-semibold shadow-sm cursor-pointer">
                <span className="material-symbols-outlined text-base">
                  edit
                </span>
                {" "}Edit Profile
              </button>
              {" "}
              <button className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-space-md py-2.5 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md font-bold shadow-[0_0_16px_rgba(16,230,104,0.35)] hover:shadow-[0_0_24px_rgba(16,230,104,0.55)] transition-all cursor-pointer" onClick={shareCard}>
                <span className="material-symbols-outlined text-base">
                  {copied ? "check" : "ios_share"}
                </span>
                {" "}{copied ? "Copied Link!" : "Share Card"}
              </button>
            </div>
          </div>
        </section>
        {" "}
        {/* Big Metrics Stats Strip */}
        {" "}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
          {/* Card 1 */}
          {" "}
          <div className="relative rounded-2xl bg-surface-container p-space-md shadow-md flex flex-col justify-between overflow-clip">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-mono">
                Bets Placed
              </span>
              {" "}
              <span className="material-symbols-outlined text-lg text-primary">
                casino
              </span>
            </div>
            {" "}
            <div className="my-space-sm">
              <div className="font-display-lg text-display-lg text-on-surface tracking-tight leading-none">
                84
              </div>
              {" "}
              <div className="font-label-sm text-label-sm text-on-surface-variant font-mono mt-1">
                Total Wagers Recorded
              </div>
            </div>
            {" "}
            <div className="pt-space-xs flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm font-mono">
              <span className="text-primary font-semibold">
                54W
              </span>
              {" "}
              <span>
                •
              </span>
              {" "}
              <span className="text-secondary font-semibold">
                26L
              </span>
              {" "}
              <span>
                •
              </span>
              {" "}
              <span className="text-on-surface-variant font-semibold">
                4 Push
              </span>
            </div>
          </div>
          {" "}
          {/* Card 2 */}
          {" "}
          <div className="relative rounded-2xl bg-surface-container p-space-md shadow-md flex flex-col justify-between overflow-clip">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-mono">
                Win Rate
              </span>
              {" "}
              <span className="material-symbols-outlined text-lg text-primary">
                trending_up
              </span>
            </div>
            {" "}
            <div className="my-space-sm">
              <div className="flex items-baseline gap-1">
                <span className="font-display-lg text-display-lg text-primary tracking-tight leading-none font-bold">
                  68.4%
                </span>
              </div>
              {" "}
              <div className="font-label-sm text-label-sm text-on-surface-variant font-mono mt-1">
                Top 15% across Bookie
              </div>
            </div>
            {" "}
            <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-clip">
              <div className="bg-primary-container h-full rounded-full shadow-[0_0_8px_rgba(16,230,104,0.6)]" style={{ width: "68.4%" }}></div>
            </div>
          </div>
          {" "}
          {/* Card 3 */}
          {" "}
          <div className="relative rounded-2xl bg-surface-container p-space-md shadow-md flex flex-col justify-between overflow-clip">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-mono">
                Streak Record
              </span>
              {" "}
              <span className="material-symbols-outlined text-lg text-secondary">
                local_fire_department
              </span>
            </div>
            {" "}
            <div className="my-space-sm">
              <div className="font-display-lg text-display-lg text-on-surface tracking-tight leading-none flex items-center gap-1">
                <span>
                  🔥
                </span>
                8
              </div>
              {" "}
              <div className="font-label-sm text-label-sm text-on-surface-variant font-mono mt-1">
                Longest Win Run
              </div>
            </div>
            {" "}
            <div className="flex items-center justify-between font-label-sm text-label-sm font-mono">
              <span className="text-on-surface-variant">
                Current Streak:
              </span>
              {" "}
              <span className="text-primary font-bold px-2 py-0.5 rounded-full bg-primary-container/15">
                3 Wins Alive
              </span>
            </div>
          </div>
          {" "}
          {/* Card 4 */}
          {" "}
          <div className="relative rounded-2xl bg-surface-container p-space-md shadow-md flex flex-col justify-between overflow-clip">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm text-label-sm uppercase tracking-wider font-mono">
                Dares Completed
              </span>
              {" "}
              <span className="material-symbols-outlined text-lg text-tertiary">
                shield
              </span>
            </div>
            {" "}
            <div className="my-space-sm">
              <div className="font-display-lg text-display-lg text-on-surface tracking-tight leading-none">
                4 / 4
              </div>
              {" "}
              <div className="font-label-sm text-label-sm text-on-surface-variant font-mono mt-1">
                Honored Penalties
              </div>
            </div>
            {" "}
            <div className="flex items-center justify-between font-label-sm text-label-sm font-mono">
              <span className="text-on-surface-variant">
                Honor Score:
              </span>
              {" "}
              <span className="text-tertiary font-bold px-2 py-0.5 rounded-full bg-tertiary-container/20 flex items-center gap-1">
                100% 🛡️
              </span>
            </div>
          </div>
        </section>
        {" "}
        {/* Lower Split Two-Column Layout */}
        {" "}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
          {/* Left Column (~60%) */}
          {" "}
          <div className="lg:col-span-7 flex flex-col gap-space-lg min-w-0">
            {/* AI Bookie Scouting Report */}
            {" "}
            <section className="rounded-2xl bg-surface-container-low p-space-lg shadow-lg relative overflow-clip">
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-tertiary-container/15 blur-2xl pointer-events-none"></div>
              {" "}
              <div className="flex items-center justify-between pb-space-sm">
                <div className="flex items-center gap-space-sm">
                  <div className="w-10 h-10 rounded-xl bg-tertiary-container/25 flex items-center justify-center text-lg shadow-[0_0_12px_rgba(157,108,255,0.4)]">
                    🤖
                  </div>
                  {" "}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-label-sm text-label-sm font-mono font-bold text-tertiary uppercase tracking-wider">
                        [BOT_ARBITER]
                      </span>
                      {" "}
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>
                    </div>
                    {" "}
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">
                      AI Scouting Report for Alex
                    </h2>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm font-mono text-on-surface-variant">
                  v2.4 Auto-Generated
                </span>
              </div>
              {" "}
              <div className="mt-space-md grid grid-cols-1 gap-space-sm">
                <div className="p-space-sm rounded-xl bg-surface-container flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-label-md text-label-md text-primary font-semibold">
                    <span className="material-symbols-outlined text-sm">
                      bolt
                    </span>
                    {" "}STRENGTHS
                  </div>
                  {" "}
                  <p className="font-body-md text-body-md text-on-surface">
                    Lethal on fitness and habit endurance bets (
                    <span className="text-primary font-semibold font-mono">
                      88% win rate
                    </span>
                    ). Possesses an uncanny radar for identifying when friends are bluffing on Sunday workout claims.
                  </p>
                </div>
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-label-md text-label-md text-secondary font-semibold">
                    <span className="material-symbols-outlined text-sm">
                      visibility_off
                    </span>
                    {" "}BLIND SPOTS
                  </div>
                  {" "}
                  <p className="font-body-md text-body-md text-on-surface">
                    Terrible at entertainment and box office predictions (
                    <span className="text-secondary font-semibold font-mono">
                      1-5 record
                    </span>
                    ). Chronically underestimates Marvel movies and big-budget tentpoles.
                  </p>
                </div>
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-label-md text-label-md text-tertiary font-semibold">
                    <span className="material-symbols-outlined text-sm">
                      psychology
                    </span>
                    {" "}SIGNATURE MOVE
                  </div>
                  {" "}
                  <p className="font-body-md text-body-md text-on-surface">
                    <span className="text-on-surface font-semibold">
                      “The Late Night Contrarian”
                    </span>
                    {" "}— locking in high-conviction stakes against exhausted friends between 11 PM and 2 AM right as their willpower collapses.
                  </p>
                </div>
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-highest/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">
                      warning
                    </span>
                    {" "}
                    <span className="font-label-md text-label-md font-semibold text-on-surface">
                      Threat Level:{" "}
                      <span className="text-secondary uppercase">
                        HIGH
                      </span>
                    </span>
                  </div>
                  {" "}
                  <span className="font-body-sm text-body-sm text-on-surface-variant italic">
                    Never bet against Alex on cold showers or 5K pacing.
                  </span>
                </div>
              </div>
            </section>
            {" "}
            {/* Bet History Section */}
            {" "}
            <section className="rounded-2xl bg-surface-container p-space-lg shadow-lg flex flex-col gap-space-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">
                    Bet History Ledger
                  </h2>
                  {" "}
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Public peer-reviewed ledger of wagers and settlements
                  </p>
                </div>
                {" "}
                {/* Filter Pills */}
                {" "}
                <div className="inline-flex p-1 rounded-xl bg-surface-container-lowest font-label-sm text-label-sm font-mono" id="bet-filter-group">
                  <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-lg transition-all ${filter === "all" ? "bg-surface-container-high text-on-surface font-bold" : "text-on-surface-variant hover:text-on-surface"}`}>
                    All
                  </button>
                  {" "}
                  <button onClick={() => setFilter("won")} className={`px-3 py-1.5 rounded-lg transition-all ${filter === "won" ? "bg-surface-container-high text-on-surface font-bold" : "text-on-surface-variant hover:text-on-surface"}`}>
                    Won
                  </button>
                  {" "}
                  <button onClick={() => setFilter("lost")} className={`px-3 py-1.5 rounded-lg transition-all ${filter === "lost" ? "bg-surface-container-high text-on-surface font-bold" : "text-on-surface-variant hover:text-on-surface"}`}>
                    Lost
                  </button>
                  {" "}
                  <button onClick={() => setFilter("pending")} className={`px-3 py-1.5 rounded-lg transition-all ${filter === "pending" ? "bg-surface-container-high text-on-surface font-bold" : "text-on-surface-variant hover:text-on-surface"}`}>
                    Pending
                  </button>
                </div>
              </div>
              {" "}
              {/* History List Rows */}
              {" "}
              <div className="flex flex-col gap-2" id="bet-history-rows">
                {/* Row 1: Elden Ring (Won) */}
                {" "}
                <div className={`p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors flex items-center justify-between gap-space-sm ${show("won") ? "" : "hidden"}`}>
                  <div className="flex items-center gap-space-sm min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary-container/15 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-lg">
                        sports_esports
                      </span>
                    </div>
                    {" "}
                    <div className="flex flex-col truncate">
                      <span className="font-body-md text-body-md text-on-surface font-medium truncate">
                        Marcus beats Elden Ring boss tonight
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                        Opponent: @marcus_g • Settled yesterday
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-md shrink-0">
                    <div className="text-right">
                      <div className="font-label-sm text-label-sm font-mono text-on-surface-variant">
                        Stake: 150 PTS
                      </div>
                      {" "}
                      <div className="font-label-sm text-label-sm font-mono text-primary font-bold">
                        +150 PTS
                      </div>
                    </div>
                    {" "}
                    <span className="px-2.5 py-1 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm font-bold uppercase shadow-[0_0_8px_rgba(16,230,104,0.3)]">
                      WON
                    </span>
                  </div>
                </div>
                {" "}
                {/* Row 2: Sub-4 Marathon (Won) */}
                {" "}
                <div className={`p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors flex items-center justify-between gap-space-sm ${show("won") ? "" : "hidden"}`}>
                  <div className="flex items-center gap-space-sm min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary-container/15 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-lg">
                        directions_run
                      </span>
                    </div>
                    {" "}
                    <div className="flex flex-col truncate">
                      <span className="font-body-md text-body-md text-on-surface font-medium truncate">
                        Sam finishes marathon sub-4
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                        Opponent: @sam_run • Strava verified
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-md shrink-0">
                    <div className="text-right">
                      <div className="font-label-sm text-label-sm font-mono text-on-surface-variant">
                        Stake: 75 PTS
                      </div>
                      {" "}
                      <div className="font-label-sm text-label-sm font-mono text-primary font-bold">
                        +75 PTS
                      </div>
                    </div>
                    {" "}
                    <span className="px-2.5 py-1 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm font-bold uppercase shadow-[0_0_8px_rgba(16,230,104,0.3)]">
                      WON
                    </span>
                  </div>
                </div>
                {" "}
                {/* Row 3: Jake 6am (Pending) */}
                {" "}
                <div className={`p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors flex items-center justify-between gap-space-sm ${show("pending") ? "" : "hidden"}`}>
                  <div className="flex items-center gap-space-sm min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-tertiary-container/20 text-tertiary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-lg">
                        alarm
                      </span>
                    </div>
                    {" "}
                    <div className="flex flex-col truncate">
                      <span className="font-body-md text-body-md text-on-surface font-medium truncate">
                        Jake wakes up at 6am
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                        Opponent: @jake_w • Settlement in 7h 12m
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-md shrink-0">
                    <div className="text-right">
                      <div className="font-label-sm text-label-sm font-mono text-on-surface-variant">
                        Stake: 250 PTS
                      </div>
                      {" "}
                      <div className="font-label-sm text-label-sm font-mono text-tertiary font-bold">
                        250 at risk
                      </div>
                    </div>
                    {" "}
                    <span className="px-2.5 py-1 rounded-full bg-surface-container-highest text-tertiary font-label-sm text-label-sm font-bold uppercase flex items-center gap-1">
                      <span>
                        ACTIVE
                      </span>
                      {" "}⏳
                    </span>
                  </div>
                </div>
                {" "}
                {/* Row 4: Dune 2 (Lost) */}
                {" "}
                <div className={`p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors flex items-center justify-between gap-space-sm ${show("lost") ? "" : "hidden"}`}>
                  <div className="flex items-center gap-space-sm min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-secondary-container/25 text-secondary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-lg">
                        movie
                      </span>
                    </div>
                    {" "}
                    <div className="flex flex-col truncate">
                      <span className="font-body-md text-body-md text-on-surface font-medium truncate">
                        Dune 2 hits $1B box office
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                        Opponent: @cine_dan • Settled BoxOfficeMojo
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-md shrink-0">
                    <div className="text-right">
                      <div className="font-label-sm text-label-sm font-mono text-on-surface-variant">
                        Stake: 200 PTS
                      </div>
                      {" "}
                      <div className="font-label-sm text-label-sm font-mono text-secondary font-bold">
                        -200 PTS
                      </div>
                    </div>
                    {" "}
                    <span className="px-2.5 py-1 rounded-full bg-secondary text-on-secondary font-label-sm text-label-sm font-bold uppercase shadow-[0_0_8px_rgba(255,178,184,0.3)]">
                      LOST
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
          {" "}
          {/* Right Column (~40%) */}
          {" "}
          <div className="lg:col-span-5 flex flex-col gap-space-lg min-w-0">
            {/* Connected Apps Panel */}
            {" "}
            <section className="rounded-2xl bg-surface-container p-space-lg shadow-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">
                    Connected Proof Apps
                  </h2>
                  {" "}
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Automated verification integrations
                  </p>
                </div>
                {" "}
                <span className="material-symbols-outlined text-on-surface-variant">
                  hub
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-space-sm">
                {APPS.map((app) => {
                  const on = apps[app.id];
                  return (
                    <div key={app.id} className="p-space-sm rounded-xl bg-surface-container-low flex items-center justify-between gap-space-sm">
                      <div className="flex items-start gap-space-sm min-w-0">
                        <div className={`w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 mt-0.5 ${on ? "text-on-surface" : "text-on-surface-variant"}`}>
                          <span className="material-symbols-outlined text-base">{app.icon}</span>
                        </div>
                        <div className="flex flex-col truncate">
                          <div className="flex items-center gap-2">
                            <span className="font-body-md text-body-md font-semibold text-on-surface">{app.name}</span>
                            <span className="font-label-sm text-label-sm px-1.5 rounded bg-surface-container-highest text-on-surface-variant">{app.kind}</span>
                            {on && <span className="w-2 h-2 rounded-full bg-primary-container shadow-[0_0_6px_rgba(16,230,104,0.8)]"></span>}
                          </div>
                          <span className="font-body-sm text-body-sm text-on-surface-variant truncate">{app.desc}</span>
                        </div>
                      </div>
                      {on ? (
                        <button onClick={() => toggleApp(app.id, app.name)} className="group px-2.5 py-1 rounded-lg bg-primary-container/10 hover:bg-surface-container-highest text-primary hover:text-secondary font-label-sm text-label-sm font-mono font-semibold transition-colors shrink-0">
                          <span className="group-hover:hidden">Active</span>
                          <span className="hidden group-hover:inline">Disconnect</span>
                        </button>
                      ) : (
                        <button onClick={() => toggleApp(app.id, app.name)} className="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-label-sm text-label-sm font-bold shadow-[0_0_8px_rgba(16,230,104,0.3)] hover:scale-105 active:scale-95 transition-all shrink-0">
                          Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            {" "}
            {/* Reputation Trophy Shelf */}
            {" "}
            <section className="rounded-2xl bg-surface-container p-space-lg shadow-lg flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">
                    Reputation Trophy Shelf
                  </h2>
                  {" "}
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Squad badges awarded for verified glory
                  </p>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm font-mono text-primary font-bold px-2 py-0.5 rounded-full bg-primary-container/15">
                  Level 7
                </span>
              </div>
              {" "}
              <div className="grid grid-cols-2 gap-space-sm">
                {/* Trophy 1 */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-low flex flex-col gap-1 items-start hover:bg-surface-container-high transition-colors">
                  <span className="text-2xl mb-1">
                    🏃
                  </span>
                  {" "}
                  <span className="font-label-md text-label-md font-semibold text-on-surface">
                    Sub-4 Supporter
                  </span>
                  {" "}
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Backed Sam's 3:54 split
                  </span>
                </div>
                {" "}
                {/* Trophy 2 */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-low flex flex-col gap-1 items-start hover:bg-surface-container-high transition-colors relative overflow-clip">
                  <div className="absolute right-0 top-0 w-12 h-12 bg-primary-container/10 rounded-full blur-md"></div>
                  {" "}
                  <span className="text-2xl mb-1">
                    👑
                  </span>
                  {" "}
                  <span className="font-label-md text-label-md font-semibold text-primary">
                    Contrarian King
                  </span>
                  {" "}
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    25 consensus fades won
                  </span>
                </div>
                {" "}
                {/* Trophy 3 */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-low flex flex-col gap-1 items-start hover:bg-surface-container-high transition-colors">
                  <span className="text-2xl mb-1">
                    🛡️
                  </span>
                  {" "}
                  <span className="font-label-md text-label-md font-semibold text-tertiary">
                    Never Welched
                  </span>
                  {" "}
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    100% loss honor rate
                  </span>
                </div>
                {" "}
                {/* Trophy 4 */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-low flex flex-col gap-1 items-start hover:bg-surface-container-high transition-colors">
                  <span className="text-2xl mb-1">
                    🚨
                  </span>
                  {" "}
                  <span className="font-label-md text-label-md font-semibold text-secondary">
                    Gym Police
                  </span>
                  {" "}
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Caught 6 bluff check-ins
                  </span>
                </div>
              </div>
              {" "}
              {/* Mini Visual Chart: Accuracy Breakdown */}
              {" "}
              <div className="p-space-sm rounded-xl bg-surface-container-lowest flex flex-col gap-2">
                <div className="flex items-center justify-between font-label-sm text-label-sm font-mono text-on-surface-variant">
                  <span>
                    CATEGORY WIN RATES
                  </span>
                  {" "}
                  <span className="text-primary font-bold">
                    AVG 68.4%
                  </span>
                </div>
                {" "}
                <div className="flex flex-col gap-1.5 font-label-sm text-label-sm font-mono">
                  <div className="flex items-center justify-between text-on-surface">
                    <span>
                      Fitness &amp; Health
                    </span>
                    {" "}
                    <span className="text-primary font-semibold">
                      88%
                    </span>
                  </div>
                  {" "}
                  <div className="w-full bg-surface-container-high h-1 rounded-full overflow-clip">
                    <div className="bg-primary-container h-full rounded-full" style={{ width: "88%" }}></div>
                  </div>
                  {" "}
                  <div className="flex items-center justify-between text-on-surface mt-1">
                    <span>
                      Habits &amp; Wakeups
                    </span>
                    {" "}
                    <span className="text-primary font-semibold">
                      74%
                    </span>
                  </div>
                  {" "}
                  <div className="w-full bg-surface-container-high h-1 rounded-full overflow-clip">
                    <div className="bg-primary-container h-full rounded-full" style={{ width: "74%" }}></div>
                  </div>
                  {" "}
                  <div className="flex items-center justify-between text-on-surface mt-1">
                    <span>
                      Pop Culture &amp; Cinema
                    </span>
                    {" "}
                    <span className="text-secondary font-semibold">
                      16%
                    </span>
                  </div>
                  {" "}
                  <div className="w-full bg-surface-container-high h-1 rounded-full overflow-clip">
                    <div className="bg-secondary h-full rounded-full" style={{ width: "16%" }}></div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {" "}
    </main>
  );
}
