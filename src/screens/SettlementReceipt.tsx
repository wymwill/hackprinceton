"use client";

import Link from "next/link";
import { useState } from "react";
import { useBookie } from "@/components/BookieProvider";
import DisputeVoteModal from "@/components/DisputeVoteModal";

const CONFETTI_COLORS = ["#10e668", "#77ff93", "#d3bdff", "#ffb2b8", "#ecdeff"];
// Deterministic so server and client render the same pieces.
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 30) / 10,
  duration: 2.6 + ((i * 17) % 20) / 10,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

const RECEIPT = {
  bet: "BET-8704",
  wager: "Sam breaks 4:00:00 marathon time in Austin",
  verdict: "SAM_WINS",
  confidence: 0.998,
  evidence: ["strava:activity", "race-chip:bib-4102", "geofence:finish", "photo:medal-scan"],
  payout: { "Sam Vance": 150, "Elena Rostova": 75, "Jake Harper": -150 },
};

export default function SettlementReceipt() {
  const { toast } = useBookie();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [tally, setTally] = useState({ uphold: 7, overturn: 0 });
  const [shared, setShared] = useState(false);
  const total = tally.uphold + tally.overturn;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {}
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const downloadProof = () => {
    const blob = new Blob([JSON.stringify(RECEIPT, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bet-8704-receipt.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
    {disputeOpen && (
      <DisputeVoteModal
        onClose={() => setDisputeOpen(false)}
        onVoted={(t, mine) => {
          setDisputeOpen(false);
          setTally({ uphold: 4 + t.uphold, overturn: t.overturn });
          toast(
            mine === "uphold"
              ? "⚖️ Vote cast: uphold. Bookie: “Democracy has spoken. Jake, the pizza awaits.”"
              : "⚖️ Vote cast: overturn. Bookie: “Bold. The chip timing disagrees with you.”",
            "purple"
          );
        }}
      />
    )}
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop py-space-lg">
      <div className="flex flex-col w-full gap-space-lg pb-space-xl">
        {/* Breadcrumb Navigation */}
        {" "}
        <nav className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md">
          <Link className="hover:text-primary transition-colors" href="/bets">
            Bets
          </Link>
          {" "}
          <span className="material-symbols-outlined text-xs">
            chevron_right
          </span>
          {" "}
          <Link className="hover:text-primary transition-colors" href="/profile">
            Settled
          </Link>
          {" "}
          <span className="material-symbols-outlined text-xs">
            chevron_right
          </span>
          {" "}
          <span className="text-primary font-bold tracking-wider">
            #BET-8704
          </span>
          {" "}
          <span className="ml-2 px-space-xs py-0.5 rounded-full bg-surface-container-high text-on-surface text-label-sm font-label-sm uppercase">
            Auto checked
          </span>
        </nav>
        {" "}
        {/* Massive Verdict Banner with Atmospheric Accents */}
        {" "}
        <section className="relative w-full rounded-2xl bg-surface-container overflow-clip shadow-xl">
          <div className="absolute -top-24 -right-16 w-96 h-96 rounded-full bg-primary-container/10 blur-3xl pointer-events-none"></div>
          {" "}
          <div className="absolute -bottom-20 -left-12 w-80 h-80 rounded-full bg-secondary-container/15 blur-3xl pointer-events-none"></div>
          <div aria-hidden className="absolute inset-0 overflow-clip pointer-events-none">
            {CONFETTI.map((c, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}
              />
            ))}
          </div>
          {" "}
          <div className="relative z-10 p-space-md lg:p-space-lg flex flex-col gap-space-md">
            {/* Top Meta Bar */}
            {" "}
            <div className="flex flex-wrap items-center justify-between gap-space-sm">
              <div className="inline-flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-lowest text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified
                </span>
                {" "}
                <span>
                  Auto decided at 11:42 AM
                </span>
              </div>
              {" "}
              <div className="flex items-center gap-space-xs">
                <span className="px-space-xs py-0.5 rounded-full bg-tertiary-container/20 text-tertiary font-label-sm text-label-sm uppercase tracking-wide">
                  Final result
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  Receipt #8704
                </span>
              </div>
            </div>
            {" "}
            {/* Main Headline Grid */}
            {" "}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-center">
              <div className="lg:col-span-8 flex flex-col gap-space-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-label-md text-label-md font-bold uppercase tracking-wider">
                    Result
                  </span>
                  {" "}
                  <span className="text-on-surface-variant font-label-sm text-label-sm">
                    Austin Marathon 2025
                  </span>
                </div>
                {" "}
                <h1 className="font-display-lg text-display-lg text-primary tracking-tight font-black uppercase drop-shadow-[0_0_24px_rgba(52,211,153,0.17)]">
                  Sam wins! 🏆 +150 pts
                </h1>
                {" "}
                <p className="font-body-lg text-body-lg text-on-surface font-medium max-w-2xl">
                  The bet:{" "}
                  <span className="text-tertiary italic">
                    "Sam breaks 4:00:00 marathon time in Austin"
                  </span>
                </p>
              </div>
              {" "}
              {/* Loser Pill Callout Card */}
              {" "}
              <div className="lg:col-span-4 flex flex-col items-start lg:items-end justify-center">
                <div className="w-full lg:w-auto p-space-md rounded-xl bg-surface-container-high shadow-md flex items-center gap-space-md">
                  <div className="stamp-in w-16 h-16 rounded-xl border-4 border-secondary bg-secondary-container/60 flex items-center justify-center text-secondary font-display-lg text-display-lg font-black shadow-[0_0_24px_rgba(251,113,133,0.25)]">
                    L
                  </div>
                  {" "}
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-xs text-label-sm text-secondary uppercase font-bold tracking-wider">
                      Dare unlocked
                    </span>
                    {" "}
                    <span className="font-headline-sm text-headline-sm text-on-surface truncate font-bold">
                      Jake takes the L 😅
                    </span>
                    {" "}
                    <span className="font-body-sm text-body-sm text-secondary-fixed-dim font-medium">
                      His dare is now due
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {" "}
            {/* Status Chips & Quick Stats Row */}
            {" "}
            <div className="pt-space-xs flex flex-wrap items-center gap-space-sm font-label-md text-label-md">
              <div className="px-space-sm py-1 rounded-full bg-surface-container-lowest text-primary font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                {" "}
                <span>
                  Goal: under 4 hours
                </span>
              </div>
              {" "}
              <div className="px-space-sm py-1 rounded-full bg-surface-container-lowest text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-on-surface-variant">
                  timer
                </span>
                {" "}
                <span>
                  Finished: 3:54:12
                </span>
              </div>
              {" "}
              <div className="px-space-sm py-1 rounded-full bg-surface-container-lowest text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-on-surface-variant">
                  group
                </span>
                {" "}
                <span>
                  375 pts in play
                </span>
              </div>
              {" "}
              <div className="px-space-sm py-1 rounded-full bg-surface-container-lowest text-tertiary flex items-center gap-1.5 ml-auto">
                <span className="material-symbols-outlined text-xs">
                  smart_toy
                </span>
                {" "}
                <span>
                  99.8% sure
                </span>
              </div>
            </div>
          </div>
        </section>
        {" "}
        {/* Main 2-Column Content Layout */}
        {" "}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Left Column: Reasoning, Confidence & Settlement Distribution */}
          {" "}
          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            {/* AI Bookie Confidence Card */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container shadow-md flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-tertiary">
                    analytics
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    How sure is the Bookie?
                  </span>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm uppercase px-space-xs py-0.5 rounded bg-tertiary/10 text-tertiary font-bold tracking-wider">
                  All sources agree
                </span>
              </div>
              {" "}
              {/* Custom Confidence Graphic */}
              {" "}
              <div className="flex flex-col gap-space-xs">
                <div className="flex justify-between items-baseline">
                  <span className="font-label-md text-label-md text-on-surface-variant">
                    Checked 3 sources
                  </span>
                  {" "}
                  <span className="font-headline-lg text-headline-lg font-bold text-tertiary drop-shadow-[0_0_12px_rgba(211,189,255,0.4)]">
                    99.8%
                  </span>
                </div>
                {" "}
                <div className="w-full h-3 rounded-full bg-surface-container-lowest overflow-clip p-0.5">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary via-tertiary to-tertiary-fixed shadow-[0_0_14px_rgba(167,139,250,0.3)]" style={{ width: "99.8%" }}></div>
                </div>
                {" "}
                <div className="flex items-center justify-between text-label-sm font-label-sm text-on-surface-variant pt-1">
                  <span>
                    Running app
                  </span>
                  {" "}
                  <span>
                    Race timing chip
                  </span>
                  {" "}
                  <span>
                    Finish line location
                  </span>
                </div>
              </div>
            </div>
            {" "}
            {/* AI Bookie Roast & Reasoning Card (Purple Theme) */}
            {" "}
            <div className="relative p-space-md lg:p-space-lg rounded-2xl bg-surface-container-high overflow-clip shadow-lg">
              <div className="absolute -right-8 -bottom-8 w-44 h-44 rounded-full bg-tertiary/10 blur-2xl pointer-events-none"></div>
              {" "}
              <div className="relative z-10 flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label-sm text-label-sm font-bold uppercase tracking-wider">
                      AI Bookie
                    </span>
                    {" "}
                    <span className="w-2 h-2 rounded-full bg-tertiary"></span>
                  </div>
                  {" "}
                  <span className="font-label-sm text-label-sm text-tertiary">
                    Decided instantly
                  </span>
                </div>
                {" "}
                <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                  <span>
                    🤖
                  </span>
                  {" "}AI Bookie Post-Mortem
                </h2>
                {" "}
                <div className="p-space-md rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-body-md leading-relaxed">
                  <p className="mb-2 text-on-surface">
                    "Sam crossed the finish line at{" "}
                    <span className="font-mono text-primary font-bold">
                      3:54:12
                    </span>
                    , 6 minutes under goal. Jake said he'd{" "}
                    <span className="text-secondary italic">
                      ‘cramp at mile 18’
                    </span>
                    . He did not."
                  </p>
                  {" "}
                  <p className="text-on-surface">
                    Sam earns{" "}
                    <span className="text-primary font-bold">
                      +150 REP PTS
                    </span>
                    {" "}and the group title{" "}
                    <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">
                      Sub-4 Demon
                    </span>
                    . Jake owes his dare.
                  </p>
                </div>
                {" "}
                {/* Unlocked Dare Box */}
                {" "}
                <div className="p-space-md rounded-xl bg-secondary-container/20 flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-label-sm text-secondary uppercase font-bold tracking-wider flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        local_fire_department
                      </span>
                      {" "}Active Dare Contract
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-secondary font-mono">
                      Expires in 48h
                    </span>
                  </div>
                  {" "}
                  <p className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    "Eat a whole pizza on a live stream."
                  </p>
                  {" "}
                  <div className="flex items-center gap-space-xs text-body-sm text-body-sm text-on-surface-variant pt-1">
                    <span className="material-symbols-outlined text-sm">
                      schedule
                    </span>
                    {" "}
                    <span>
                      Due in 48 hours.
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {" "}
            {/* Reputation Transfer Table */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container shadow-md flex flex-col gap-space-sm">
              <div className="flex items-center justify-between pb-space-xs">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary">
                    payments
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    Who got what
                  </span>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  Points
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-2">
                {/* Winner: Sam */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-high flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-headline-sm">
                      S
                    </div>
                    {" "}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-lg text-label-lg text-on-surface font-bold">
                          Sam Vance
                        </span>
                        {" "}
                        <span className="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-label-sm text-label-sm font-bold">
                          Winner
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Made the bet
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex flex-col items-end">
                    <span className="font-headline-md text-headline-md text-primary font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.2)]">
                      +150 PTS
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Now 1,840 pts
                    </span>
                  </div>
                </div>
                {" "}
                {/* Side Bettor: Elena */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-high flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-10 h-10 rounded-full bg-surface-bright text-on-surface flex items-center justify-center font-bold text-headline-sm">
                      E
                    </div>
                    {" "}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-lg text-label-lg text-on-surface font-bold">
                          Elena Rostova
                        </span>
                        {" "}
                        <span className="px-1.5 py-0.2 rounded-full bg-tertiary-container/30 text-tertiary font-label-sm text-label-sm font-bold">
                          Side bet
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Backed Sam at 1.5x
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex flex-col items-end">
                    <span className="font-headline-md text-headline-md text-primary font-bold">
                      +75 PTS
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      Now 920 pts
                    </span>
                  </div>
                </div>
                {" "}
                {/* Loser: Jake */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-high flex items-center justify-between">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-headline-sm">
                      J
                    </div>
                    {" "}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-lg text-label-lg text-on-surface font-bold">
                          Jake Harper
                        </span>
                        {" "}
                        <span className="px-1.5 py-0.2 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold">
                          Owes a dare
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Bet against Sam
                      </span>
                    </div>
                  </div>
                  {" "}
                  <div className="flex flex-col items-end">
                    <span className="font-headline-md text-headline-md text-secondary font-bold">
                      -150 PTS
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-secondary-fixed-dim font-bold">
                      Dare Owed 🍕
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {" "}
            {/* Action Row: Dispute & Share */}
            {" "}
            <div className="flex flex-wrap items-center gap-space-md pt-space-xs">
              <div className="relative group">
                <button onClick={() => setDisputeOpen(true)} className="flex items-center gap-space-xs px-space-md py-space-sm rounded-xl bg-secondary-container text-on-secondary-container hover:bg-secondary hover:text-on-secondary font-headline-sm text-headline-sm font-bold transition-all shadow-md active:scale-95 cursor-pointer">
                  <span className="material-symbols-outlined text-base">
                    gavel
                  </span>
                  {" "}
                  <span>
                    Disagree? Start a group vote ⚖️
                  </span>
                </button>
                {" "}
                {/* Tooltip */}
                {" "}
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:flex px-space-sm py-1.5 rounded-lg bg-surface-container-highest text-on-surface font-body-sm text-body-sm whitespace-nowrap shadow-xl z-20">
                  Needs 3 of 5 votes
                </div>
              </div>
              {" "}
              <button onClick={share} className="flex items-center gap-space-xs px-space-md py-space-sm rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-headline-sm text-headline-sm font-semibold transition-all shadow-md active:scale-95 cursor-pointer">
                <span className={`material-symbols-outlined text-base ${shared ? "text-primary" : ""}`}>
                  {shared ? "check" : "photo_camera"}
                </span>
                {" "}
                <span>
                  {shared ? "Receipt link copied!" : "Share Receipt 📸"}
                </span>
              </button>
              {" "}
              <button onClick={downloadProof} className="ml-auto text-on-surface-variant hover:text-on-surface font-label-md text-label-md flex items-center gap-1 transition-colors">
                <span>
                  Download receipt
                </span>
                {" "}
                <span className="material-symbols-outlined text-xs">
                  download
                </span>
              </button>
            </div>
          </div>
          {" "}
          {/* Right Column: Cited Evidence Cards Grid & Dispute Status */}
          {" "}
          <div className="lg:col-span-5 flex flex-col gap-space-lg">
            {/* Evidence Docket Card Container */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container shadow-md flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-primary">
                    folder_open
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    Evidence
                  </span>
                </div>
                {" "}
                <span className="px-space-xs py-0.5 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm font-bold">
                  4 of 4 checked
                </span>
              </div>
              {" "}
              {/* Evidence Item 1: Strava */}
              {" "}
              <div className="p-space-md rounded-xl bg-surface-container-high flex flex-col gap-space-xs transition-transform hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-7 h-7 rounded-lg bg-[#FC5200]/20 flex items-center justify-center text-[#FC5200]">
                      <span className="material-symbols-outlined text-base">
                        directions_run
                      </span>
                    </span>
                    {" "}
                    <span className="font-label-lg text-label-lg text-on-surface font-bold">
                      Running app activity
                    </span>
                  </div>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    Today at 11:28 AM
                  </span>
                </div>
                {" "}
                <p className="font-label-md text-label-md text-primary font-mono mt-1">
                  3:54:12 · 26.2 mi
                </p>
                {" "}
                <div className="flex items-center justify-between pt-space-xs">
                  {" "}
                  <a className="text-primary hover:underline font-label-sm text-label-sm flex items-center gap-0.5 font-bold" href="#">
                    View activity{" "}
                    <span className="material-symbols-outlined text-xs">
                      north_east
                    </span>
                  </a>
                </div>
              </div>
              {" "}
              {/* Evidence Item 2: Race Chip Timing Bib */}
              {" "}
              <div className="p-space-md rounded-xl bg-surface-container-high flex flex-col gap-space-xs transition-transform hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-7 h-7 rounded-lg bg-tertiary-container/30 flex items-center justify-center text-tertiary">
                      <span className="material-symbols-outlined text-base">
                        tag
                      </span>
                    </span>
                    {" "}
                    <span className="font-label-lg text-label-lg text-on-surface font-bold">
                      Race timing chip
                    </span>
                  </div>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    Today at 11:35 AM
                  </span>
                </div>
                {" "}
                <p className="font-label-md text-label-md text-on-surface font-mono mt-1">
                  Finish 3:54:12
                </p>
                {" "}
                <div className="flex items-center justify-between pt-space-xs text-body-sm text-body-sm text-on-surface-variant">
                  <span>
                    Official race results
                  </span>
                  {" "}
                  <span className="px-space-xs py-0.2 rounded bg-surface-container-lowest text-primary font-label-sm text-label-sm">
                    Verified
                  </span>
                </div>
              </div>
              {" "}
              {/* Evidence Item 3: Geolocation Geofence Log */}
              {" "}
              <div className="p-space-md rounded-xl bg-surface-container-high flex flex-col gap-space-xs transition-transform hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-7 h-7 rounded-lg bg-surface-bright flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-base">
                        pin_drop
                      </span>
                    </span>
                    {" "}
                    <span className="font-label-lg text-label-lg text-on-surface font-bold">
                      Finish line location
                    </span>
                  </div>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    Today at 11:28:44 AM
                  </span>
                </div>
                {" "}
                <p className="font-label-md text-label-md text-on-surface-variant font-mono mt-1">
                  Matched the finish line
                </p>
                {" "}
              </div>
              {" "}
              {/* Evidence Item 4: Finisher Photo with Medal */}
              {" "}
              <div className="p-space-md rounded-xl bg-surface-container-high flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-7 h-7 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-base">
                        add_a_photo
                      </span>
                    </span>
                    {" "}
                    <span className="font-label-lg text-label-lg text-on-surface font-bold">
                      Finish photo
                    </span>
                  </div>
                  {" "}
                  <span className="font-label-sm text-label-sm text-primary font-bold">
                    Photo Match Confirmed
                  </span>
                </div>
                {" "}
                {/* Image Placeholder with prompt */}
                {" "}
                <div className="relative w-full h-48 rounded-xl overflow-clip shadow-inner">
                  <img className="w-full h-full object-cover" alt="A triumphant young athletic runner wearing a sweaty race singlet and Austin marathon medal smiling with arms raised at the sunny urban finish festival, ultra modern crisp sports photography, dramatic lighting, vivid athletic details, 8k resolution" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAbE3y60-ZpTWKA0NFtu88641I2GisbFmEQ_ORC-VvW927wlXVfZoaOqVteq-f5hS3y7raHV0g21ICKbevqUSJRYl5MbBKdX8Hixpn6pMH_j2tTOIFTawSeHl1KqLVHICdsBVawNs_9QEUx0NXpSmRMmsYA-60xxMN_zhLXHpolugVYZQRO7wre0K3bLF-d0zVJgjLduwxekd1aTyJm3cEP0MFS05BokTKZy7bkTi8K" />
                  {" "}
                  <div className="absolute bottom-2 left-2 right-2 px-space-sm py-1.5 rounded-lg bg-surface/90 backdrop-blur-md flex items-center justify-between">
                    <span className="font-label-sm text-label-sm text-on-surface flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-primary">
                        face
                      </span>
                      {" "}
                      <span>
                        4 friends confirmed this is Sam
                      </span>
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-primary font-bold">
                      100% Match
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {" "}
            {/* Dispute Status Box */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container-low shadow-md flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-on-surface-variant">
                    shield
                  </span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface">
                    Group check
                  </span>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  22h remaining
                </span>
              </div>
              {" "}
              <p className="font-body-md text-body-md text-on-surface-variant">
                Open for votes until tomorrow.
              </p>
              {" "}
              {/* Dynamic Voting Bar Representation */}
              {" "}
              <div className="flex flex-col gap-1.5 pt-space-xs">
                <div className="flex items-center justify-between font-label-md text-label-md">
                  <span className="text-primary font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      thumb_up
                    </span>
                    {" "}{tally.uphold} Confirmations ({Math.round((tally.uphold / total) * 100)}%)
                  </span>
                  {" "}
                  <span className="text-secondary font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      thumb_down
                    </span>
                    {" "}{tally.overturn} Disputes ({Math.round((tally.overturn / total) * 100)}%)
                  </span>
                </div>
                {" "}
                <div className="w-full h-2 rounded-full bg-surface-container-lowest overflow-clip flex">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(tally.uphold / total) * 100}%` }}></div>
                  {" "}
                  <div className="h-full bg-secondary transition-all" style={{ width: `${(tally.overturn / total) * 100}%` }}></div>
                </div>
              </div>
              {" "}
            </div>
            {" "}
            {/* Participant Chat Quote Quick Card */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container-high shadow-sm flex items-start gap-space-sm">
              <div className="w-9 h-9 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-headline-sm shrink-0">
                J
              </div>
              {" "}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-label-md text-label-md text-on-surface font-bold">
                    Jake Harper
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    11:44 AM
                  </span>
                </div>
                {" "}
                <p className="font-body-sm text-body-sm text-on-surface-variant italic">
                  "Fine. Ordering the pizza 😭"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {" "}
    </main>
    </>
  );
}
