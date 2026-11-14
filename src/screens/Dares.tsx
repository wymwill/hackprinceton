"use client";

import { useRef, useState } from "react";
import { useBookie } from "@/components/BookieProvider";

// Clockwise from 3 o'clock, 72° each — matches the SVG sector order.
const SECTORS = ["🧅 Raw Onion Slam", "💥 50 Burpees on IG Live", "👕 Wear the Rival Jersey", "🎤 Full Discord Standup", "🎶 T-Swift Karaoke"];

type Review = { approved: number; rejected: number; mine: null | "yes" | "no" };

export default function Dares() {
  const { toast } = useBookie();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastRoll, setLastRoll] = useState("Raw Onion Slam (Jake)");
  const [alexProof, setAlexProof] = useState<null | string>(null);
  const [marcus, setMarcus] = useState<Review>({ approved: 4, rejected: 0, mine: null });
  const [elena, setElena] = useState<Review>({ approved: 3, rejected: 1, mine: null });
  const fileRef = useRef<HTMLInputElement>(null);

  const spin = () => {
    if (spinning) return;
    const next = rotation + 1800 + Math.floor(Math.random() * 1440);
    setRotation(next);
    setSpinning(true);
    setTimeout(() => {
      // Pointer sits at 12 o'clock (270° in SVG angle space).
      const atPointer = (((270 - next) % 360) + 360) % 360;
      const landed = SECTORS[Math.floor(atPointer / 72)];
      setLastRoll(`${landed.replace(/^\S+\s/, "")} (Jake)`);
      setSpinning(false);
      toast(`🎡 The wheel has spoken: ${landed}. Jake has 48h. 🤖`, "coral");
    }, 4100);
  };

  const vote = (who: "marcus" | "elena", v: "yes" | "no") => {
    const set = who === "marcus" ? setMarcus : setElena;
    set((r) => (r.mine ? r : { approved: r.approved + (v === "yes" ? 1 : 0), rejected: r.rejected + (v === "no" ? 1 : 0), mine: v }));
    toast(v === "yes" ? "👍 Vote counted. Dare honored." : "👎 Sent back for a redo. No mercy.", v === "yes" ? "lime" : "coral");
  };

  const reviewBar = (r: Review, needed: string) => (
    <>
      <div className="flex items-center justify-between font-label-sm text-label-sm">
        <span className="text-primary font-bold">{r.approved} / 5 Approved</span>
        <span className="text-on-surface-variant font-mono">{r.approved >= 5 ? "Cleared ✓ Hall of Fame bound" : needed}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-surface-container-high overflow-clip flex">
        <div className="h-full bg-primary-container transition-all" style={{ width: `${(r.approved / 5) * 100}%` }}></div>
        <div className="h-full bg-secondary-container transition-all" style={{ width: `${(r.rejected / 5) * 100}%` }}></div>
      </div>
    </>
  );

  const voteBtns = (who: "marcus" | "elena", r: Review, noLabel: string) => (
    <div className="grid grid-cols-2 gap-space-xs pt-space-xs">
      <button disabled={!!r.mine} onClick={() => vote(who, "yes")} className={`py-space-sm rounded-xl transition-all font-label-md text-label-md font-bold flex items-center justify-center gap-1 ${r.mine === "yes" ? "bg-primary-container text-on-primary" : "bg-primary-container/20 text-primary hover:bg-primary-container hover:text-on-primary"} disabled:cursor-default ${r.mine === "no" ? "opacity-40" : ""}`}>
        <span className="material-symbols-outlined text-sm">thumb_up</span> {r.mine === "yes" ? "Approved ✓" : "Approve 👍"}
      </button>
      <button disabled={!!r.mine} onClick={() => vote(who, "no")} className={`py-space-sm rounded-xl transition-all font-label-md text-label-md font-bold flex items-center justify-center gap-1 ${r.mine === "no" ? "bg-secondary-container text-on-secondary-container" : "bg-secondary-container/20 text-secondary hover:bg-secondary-container hover:text-on-secondary"} disabled:cursor-default ${r.mine === "yes" ? "opacity-40" : ""}`}>
        <span className="material-symbols-outlined text-sm">thumb_down</span> {r.mine === "no" ? "Voted ✓" : noLabel}
      </button>
    </div>
  );

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop py-space-lg">
      <div className="flex flex-col w-full gap-space-xl">
        {/* Top Banner / Headline Strip */}
        {" "}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-secondary font-bold px-space-xs py-0.5 rounded-full bg-secondary-container/30">
                Court of Honor
              </span>
              {" "}
              <span className="text-outline-variant font-label-sm text-label-sm">
                /
              </span>
              {" "}
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium tracking-wide">
                PUNISHMENT SYSTEM v2.4
              </span>
            </div>
            {" "}
            <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight flex items-center gap-space-sm">
              Wall of Shame{" "}
              <span className="text-secondary font-headline-sm text-headline-sm lowercase">
                &amp; Dare Vault
              </span>
            </h1>
            {" "}
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              Every loss carries collateral. Debts must be paid in full video evidence or suffer group-wide dishonor. AI Arbiter verifies proof validity.
            </p>
          </div>
          {" "}
          {/* Live Stats Ticker Strip */}
          {" "}
          <div className="flex items-center gap-space-sm overflow-x-auto pb-1">
            <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded-xl bg-surface-container-low shadow-sm">
              <span className="material-symbols-outlined text-primary text-xl">
                verified
              </span>
              {" "}
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface leading-none">
                  14
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                  Completed
                </span>
              </div>
            </div>
            {" "}
            <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded-xl bg-surface-container-low shadow-sm">
              <span className="material-symbols-outlined text-secondary text-xl">
                pending_actions
              </span>
              {" "}
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-secondary leading-none">
                  3
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                  Pending
                </span>
              </div>
            </div>
            {" "}
            <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded-xl bg-surface-container-low shadow-sm">
              <span className="material-symbols-outlined text-tertiary text-xl">
                shield
              </span>
              {" "}
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface leading-none">
                  100%
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                  Honor Rate (0 Welched)
                </span>
              </div>
            </div>
          </div>
        </div>
        {" "}
        {/* Hero Interactive Section: The Punishment Wheel & AI Arbiter Desk */}
        {" "}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-stretch">
          {/* Wheel Component Box */}
          {" "}
          <div className="lg:col-span-8 bg-surface-container-low rounded-2xl p-space-lg flex flex-col md:flex-row items-center justify-between gap-space-xl relative overflow-clip shadow-xl">
            {/* Glow Underlay */}
            {" "}
            <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none"></div>
            {" "}
            <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-primary-container/15 blur-3xl pointer-events-none"></div>
            {" "}
            {/* Left Wheel Visual Widget */}
            {" "}
            <div className="relative flex items-center justify-center w-72 h-72 md:w-80 md:h-80 flex-shrink-0">
              {/* Monospace Compass Ring */}
              {" "}
              <div className="absolute inset-0 rounded-full bg-surface-container-lowest shadow-2xl flex items-center justify-center p-2">
                {/* Outer Tick marks SVG */}
                {" "}
                <svg className="w-full h-full text-outline-variant/30" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" fill="none" r="48" stroke="currentColor" strokeDasharray="2, 4" strokeWidth="1.5"></circle>
                </svg>
              </div>
              {" "}
              {/* Wheel Disc Rotating Element */}
              {" "}
              <div className="relative w-64 h-64 md:w-72 md:h-72 rounded-full overflow-clip shadow-inner flex items-center justify-center" style={{ transform: `rotate(${rotation}deg)`, transition: "transform 4s cubic-bezier(0.15, 0.9, 0.25, 1)" }}>
                <svg className="w-full h-full" viewBox="0 0 300 300">
                  <g transform="translate(150, 150)">
                    {/* Sector 1: Eat 1 Raw Onion */}
                    {" "}
                    <path d="M 0 0 L 150 0 A 150 150 0 0 1 46.35 142.66 Z" fill="#ac0037" opacity="0.95"></path>
                    {" "}
                    {/* Sector 2: 50 Burpees on IG Live */}
                    {" "}
                    <path d="M 0 0 L 46.35 142.66 A 150 150 0 0 1 -121.35 88.17 Z" fill="#181c24"></path>
                    {" "}
                    {/* Sector 3: Wear Rival Jersey */}
                    {" "}
                    <path d="M 0 0 L -121.35 88.17 A 150 150 0 0 1 -121.35 -88.17 Z" fill="#652ec4" opacity="0.9"></path>
                    {" "}
                    {/* Sector 4: Full Discord Standup */}
                    {" "}
                    <path d="M 0 0 L -121.35 -88.17 A 150 150 0 0 1 46.35 -142.66 Z" fill="#262a33"></path>
                    {" "}
                    {/* Sector 5: Sing Taylor Swift */}
                    {" "}
                    <path d="M 0 0 L 46.35 -142.66 A 150 150 0 0 1 150 0 Z" fill="#006127" opacity="0.95"></path>
                  </g>
                </svg>
                {" "}
                {/* Label overlays radiating out */}
                {" "}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-on-surface font-label-sm text-label-sm uppercase font-bold">
                  <span className="absolute translate-x-14 translate-y-6 rotate-[36deg] text-secondary-fixed text-center w-20 leading-tight">
                    🧅 Raw Onion
                  </span>
                  {" "}
                  <span className="absolute -translate-x-6 translate-y-16 rotate-[108deg] text-on-surface text-center w-20 leading-tight">
                    💥 50 Burpees IG
                  </span>
                  {" "}
                  <span className="absolute -translate-x-16 -translate-y-2 rotate-[180deg] text-tertiary-fixed text-center w-24 leading-tight">
                    👕 Rival Jersey
                  </span>
                  {" "}
                  <span className="absolute -translate-x-6 -translate-y-16 rotate-[252deg] text-on-surface-variant text-center w-20 leading-tight">
                    🎤 Discord Standup
                  </span>
                  {" "}
                  <span className="absolute translate-x-14 -translate-y-8 rotate-[324deg] text-primary-fixed text-center w-20 leading-tight">
                    🎶 T-Swift Karaoke
                  </span>
                </div>
                {" "}
                {/* Wheel Center Hub */}
                {" "}
                <div className="absolute w-14 h-14 rounded-full bg-surface-container-highest shadow-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-secondary text-2xl">
                    casino
                  </span>
                </div>
              </div>
              {" "}
              {/* Wheel Top Pointer */}
              {" "}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
                <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[16px] border-t-primary-container filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"></div>
                {" "}
                <div className="w-1.5 h-1.5 rounded-full bg-surface"></div>
              </div>
            </div>
            {" "}
            {/* Right Action & Wheel Lore */}
            {" "}
            <div className="flex flex-col gap-space-md flex-1 min-w-0 z-10">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary animate-bounce">
                  near_me
                </span>
                {" "}
                <span className="font-label-md text-label-md text-secondary font-bold uppercase tracking-wider">
                  High Roller Wheel of Doom
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-space-xs">
                <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                  Spin For Jake's Next Loss 🎲
                </h2>
                {" "}
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Jake is down 0-2 in the playoff series bet. When Boston loses, the wheel dictates his collateral. No substitutions permitted.
                </p>
              </div>
              {" "}
              {/* Recent Wheel Payout Ticker */}
              {" "}
              <div className="p-space-sm rounded-xl bg-surface-container-lowest flex items-center justify-between gap-space-sm">
                <div className="flex items-center gap-space-xs truncate">
                  <span className="w-2 h-2 rounded-full bg-secondary-container"></span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                    Last Rolled Penalty:
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold truncate">
                    {lastRoll}
                  </span>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm text-primary px-space-xs py-0.5 rounded-full bg-surface-container">
                  Odds: 1:5
                </span>
              </div>
              {" "}
              {/* Interactive Spin CTA */}
              {" "}
              <div className="flex items-center gap-space-sm pt-space-xs">
                <button onClick={spin} disabled={spinning} className="flex-1 flex items-center justify-center gap-space-xs py-space-sm px-space-md rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_24px_rgba(16,230,104,0.35)] hover:shadow-[0_0_32px_rgba(16,230,104,0.55)] hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100">
                  <span className={`material-symbols-outlined ${spinning ? "animate-spin" : ""}`}>
                    restart_alt
                  </span>
                  {" "}
                  <span>
                    {spinning ? "The wheel decides…" : "Spin for Jake's Fate"}
                  </span>
                </button>
                {" "}
                <button className="p-space-sm rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer" title="Dare History Log">
                  <span className="material-symbols-outlined">
                    history
                  </span>
                </button>
              </div>
            </div>
          </div>
          {" "}
          {/* AI Arbiter Callout & Group Rules Sidebar */}
          {" "}
          <div className="lg:col-span-4 flex flex-col gap-space-md">
            {/* AI Arbiter Box */}
            {" "}
            <div className="relative p-space-md rounded-2xl bg-surface-container-low shadow-lg flex flex-col justify-between overflow-clip">
              <div className="absolute -right-8 -top-8 w-40 h-40 bg-tertiary-container/10 rounded-full blur-2xl pointer-events-none"></div>
              {" "}
              <div className="flex flex-col gap-space-sm z-10">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-tertiary-container/30 text-tertiary font-bold uppercase tracking-wider">
                    [BOT_ARBITER_RULING]
                  </span>
                  {" "}
                  <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse"></span>
                </div>
                {" "}
                <p className="font-headline-sm text-headline-sm text-on-surface leading-snug">
                  “Marcus's manicure video has been classified as 85% sincere. The clown wig was permitted under Section 4B of the Gym Arc Codex.”
                </p>
                {" "}
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Automated image parsing detected no deepfakes in Elena's Carolina Reaper submission. Milk sip timestamp recorded at 00:04.
                </p>
              </div>
              {" "}
              <div className="pt-space-md mt-space-sm flex items-center justify-between z-10">
                <span className="font-label-sm text-label-sm text-tertiary font-mono">
                  ARBITER PROTOCOL: STRICT
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">
                    gavel
                  </span>
                  {" "}Zero Welching Tolerance
                </span>
              </div>
            </div>
            {" "}
            {/* Quick Dare Rulebook Pill Strip */}
            {" "}
            <div className="p-space-md rounded-2xl bg-surface-container-lowest flex flex-col gap-space-sm">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">
                Group Punishment Statutes
              </span>
              {" "}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between py-1 text-on-surface font-body-sm text-body-sm">
                  <span>
                    1. Proof must be 1080p raw video
                  </span>
                  {" "}
                  <span className="material-symbols-outlined text-primary text-sm">
                    check_circle
                  </span>
                </div>
                {" "}
                <div className="flex items-center justify-between py-1 text-on-surface font-body-sm text-body-sm">
                  <span>
                    2. 48hr turnaround from bet close
                  </span>
                  {" "}
                  <span className="material-symbols-outlined text-primary text-sm">
                    check_circle
                  </span>
                </div>
                {" "}
                <div className="flex items-center justify-between py-1 text-on-surface font-body-sm text-body-sm">
                  <span>
                    3. Majority vote (4/5) to discharge
                  </span>
                  {" "}
                  <span className="material-symbols-outlined text-primary text-sm">
                    check_circle
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {" "}
        {/* Section Header & Controls */}
        {" "}
        <div className="flex items-center justify-between pt-space-sm">
          <div className="flex items-center gap-space-sm">
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold uppercase tracking-tight">
              Active Dare Board
            </h2>
            {" "}
            <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono">
              KANBAN VIEW
            </span>
          </div>
          {" "}
          <div className="flex items-center gap-space-xs">
            <button className="px-space-sm py-1 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors cursor-pointer flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">
                filter_list
              </span>
              {" "}Filter
            </button>
            {" "}
            <button className="px-space-sm py-1 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container-highest transition-colors cursor-pointer flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">
                sort
              </span>
              {" "}Urgency
            </button>
          </div>
        </div>
        {" "}
        {/* Kanban Board: 3 Columns */}
        {" "}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter-desktop items-start">
          {/* COLUMN 1: Pending Dares */}
          {" "}
          <div className="flex flex-col gap-space-md">
            {/* Column Header */}
            {" "}
            <div className="flex items-center justify-between px-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="w-3 h-3 rounded-full bg-secondary-container"></span>
                {" "}
                <h3 className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-tight">
                  ⏳ Pending Dares
                </h3>
              </div>
              {" "}
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary font-bold">
                3 UNPAID
              </span>
            </div>
            {" "}
            {/* Card 1.1: Jake owes Sam */}
            {" "}
            <div className="flex flex-col gap-space-md p-space-md rounded-2xl bg-surface-container-low shadow-md relative overflow-clip group hover:scale-[1.01] transition-transform">
              {/* Accent Top Bar */}
              {" "}
              <div className="absolute top-0 left-0 right-0 h-1 bg-secondary-container"></div>
              {" "}
              <div className="flex items-start justify-between gap-space-sm">
                <div className="flex items-center gap-space-sm">
                  <div className="relative">
                    <img className="w-10 h-10 rounded-full object-cover" alt="Close up photographic portrait of Jake, a young man with athletic cap and focused expression in dark moody lighting with neon red rim light." src="https://lh3.googleusercontent.com/aida-public/AB6AXuAuok6iQhl5g5dLA6ybtbfA3mnfSBn9C7cRV6WHaPbjgRpfbbc5OcBKsx0pX86kizFr__XlzqECk6UsVR4BQCY2nYDq-Nqf_DpvrLU4vM3FzekwmCbUuZKSN-Tu60RRZiWCtd1-pGENAnEA2Kx2l9hbfE1x1o9Bh-32SdL0ekXdQmI136K1-DONpFbfi0MTuErDHk0du0LfUrHK_eLfHqAMWdHFneGsb-0esY2TfSn0" />
                    {" "}
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-secondary-container text-on-secondary font-label-sm text-label-sm flex items-center justify-center font-bold">
                      L
                    </span>
                  </div>
                  {" "}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                        Jake
                      </span>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        owes
                      </span>
                      {" "}
                      <span className="font-headline-sm text-headline-sm text-primary leading-tight">
                        Sam
                      </span>
                    </div>
                    {" "}
                    <span className="font-label-sm text-label-sm text-outline-variant font-mono">
                      BET-8810 • Sweep Rd 2
                    </span>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-secondary-container/30 text-secondary-fixed font-bold tracking-wider uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">
                    timer
                  </span>
                  {" "}2d Left
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-lowest">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                  The Punishment:
                </span>
                {" "}
                <p className="font-body-md text-body-md text-on-surface font-medium leading-snug">
                  “Wear a Boston Celtics jersey to the Dallas sports bar during Game 7 and toast every Dallas turnover.”
                </p>
              </div>
              {" "}
              <div className="flex items-center justify-between pt-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">
                    videocam
                  </span>
                  {" "}Proof: Video (Min 2m)
                </span>
                {" "}
                <button className="px-space-md py-1.5 rounded-xl bg-surface-container-high text-on-surface-variant/50 font-label-md text-label-md cursor-not-allowed flex items-center gap-1" disabled>
                  <span className="material-symbols-outlined text-sm">
                    lock
                  </span>
                  {" "}Upload Proof 📸
                </button>
              </div>
            </div>
            {" "}
            {/* Card 1.2: Marcus owes Priya */}
            {" "}
            <div className="flex flex-col gap-space-md p-space-md rounded-2xl bg-surface-container-low shadow-md relative overflow-clip group hover:scale-[1.01] transition-transform">
              <div className="absolute top-0 left-0 right-0 h-1 bg-secondary-container/70"></div>
              {" "}
              <div className="flex items-start justify-between gap-space-sm">
                <div className="flex items-center gap-space-sm">
                  <div className="relative">
                    <img className="w-10 h-10 rounded-full object-cover" alt="Portrait photo of Marcus, a stylish twenty-something man looking somewhat regretful with neon purple background ambient glow." src="https://lh3.googleusercontent.com/aida-public/AB6AXuB4CVjAtsgEyWY5xSZggXcP9wh_L8nD3tTXBoxvFP0nT6P-EwVGBFx5DfWtMHc0LVrn9tv_0kanZHwnNwp5lgaz0-x6LuCK8rTCi-I40dE6wymY-xWa4uDbkwFqYmepbpM5g-TkNycR81KQMcC7Sk2gwI2m_j1nCbSrofL9VoHRCQqQFkeZDfvBd7F1aGOTgfkcQWkXegz1T4Ya3eAWb6nwlbv33fnxPz11Duk5tyYW" />
                    {" "}
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-secondary-container text-on-secondary font-label-sm text-label-sm flex items-center justify-center font-bold">
                      L
                    </span>
                  </div>
                  {" "}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                        Marcus
                      </span>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        owes
                      </span>
                      {" "}
                      <span className="font-headline-sm text-headline-sm text-tertiary leading-tight">
                        Priya
                      </span>
                    </div>
                    {" "}
                    <span className="font-label-sm text-label-sm text-outline-variant font-mono">
                      BET-8794 • 1RM Bench Loss
                    </span>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-surface-container text-on-surface-variant font-bold tracking-wider uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">
                    schedule
                  </span>
                  {" "}4d Left
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-lowest">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                  The Punishment:
                </span>
                {" "}
                <p className="font-body-md text-body-md text-on-surface font-medium leading-snug">
                  “Post a 60-second TikTok review of glitter nail polish with an utterly serious tech-reviewer tone.”
                </p>
              </div>
              {" "}
              <div className="flex items-center justify-between pt-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">
                    public
                  </span>
                  {" "}Platform: TikTok
                </span>
                {" "}
                <button className="px-space-md py-1.5 rounded-xl bg-surface-container-high text-on-surface-variant/50 font-label-md text-label-md cursor-not-allowed flex items-center gap-1" disabled>
                  <span className="material-symbols-outlined text-sm">
                    lock
                  </span>
                  {" "}Upload Proof 📸
                </button>
              </div>
            </div>
            {" "}
            {/* Card 1.3: Alex (You) owes David — moves to Proof Submitted once uploaded */}
            {!alexProof && (
            <div className="flex flex-col gap-space-md p-space-md rounded-2xl bg-surface-container shadow-xl relative overflow-clip ring-2 ring-primary-container/40">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary-container"></div>
              {" "}
              <div className="absolute -right-12 -top-12 w-28 h-28 bg-primary-container/10 rounded-full blur-xl pointer-events-none"></div>
              {" "}
              <div className="flex items-start justify-between gap-space-sm z-10">
                <div className="flex items-center gap-space-sm">
                  <div className="relative">
                    <img className="w-10 h-10 rounded-full object-cover" alt="Selfie style photograph of user Alex wearing a casual black hoodie in dim sports room setting, crisp lighting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDPo6ar666PZ5GGG-KZbfVbdwMrDgQEnAruD_QKgfhcgGnNUr05xacZPo12IsU8pq6tY0iq_v2VsKjFE02asO11TLzwTIZAZCMjkXnsJ9Bs5XKvmqYENTntuKWW7KHEKy6X9EsFyRxdSzRgUPjPVI4LqrGuyC51PNLurqIi5MAx-LhmHdQzIqY1E0aPsa4J93kQ3mkSf8eYkHeENEiV5b-JH8m1Nn0WVdj-QARIiMM_" />
                    {" "}
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-secondary-container text-on-secondary font-label-sm text-label-sm flex items-center justify-center font-bold">
                      YOU
                    </span>
                  </div>
                  {" "}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="font-headline-sm text-headline-sm text-primary font-bold leading-tight">
                        Alex (You)
                      </span>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        owe
                      </span>
                      {" "}
                      <span className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                        David
                      </span>
                    </div>
                    {" "}
                    <span className="font-label-sm text-label-sm text-primary-fixed-dim font-mono">
                      YOUR DEBT • Fantasy Matchup
                    </span>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-bold tracking-wider uppercase animate-pulse">
                  Action Req.
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-lowest z-10">
                <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                  Your Required Punishment:
                </span>
                {" "}
                <p className="font-body-md text-body-md text-on-surface font-semibold leading-snug">
                  “Do tomorrow morning's engineering standup presentation entirely in a full Caribbean pirate accent.”
                </p>
              </div>
              {" "}
              <div className="flex items-center justify-between pt-space-xs z-10">
                <span className="font-label-sm text-label-sm text-primary flex items-center gap-1 font-mono">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                  {" "}Live Penalty
                </span>
                {" "}
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setAlexProof(f.name);
                    toast("📤 Proof submitted! The squad is reviewing. Bookie: “Arr, nice accent.” 🏴‍☠️", "lime");
                  }}
                />
                <button onClick={() => fileRef.current?.click()} className="px-space-md py-2 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg font-bold shadow-[0_0_16px_rgba(16,230,104,0.4)] hover:shadow-[0_0_24px_rgba(16,230,104,0.6)] hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-base">
                    video_call
                  </span>
                  {" "}
                  <span>
                    Upload Proof / Video
                  </span>
                </button>
              </div>
            </div>
            )}
          </div>
          {" "}
          {/* COLUMN 2: Proof Submitted (Group Review) */}
          {" "}
          <div className="flex flex-col gap-space-md">
            {/* Column Header */}
            {" "}
            <div className="flex items-center justify-between px-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="w-3 h-3 rounded-full bg-tertiary"></span>
                {" "}
                <h3 className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-tight">
                  👀 Proof Submitted
                </h3>
              </div>
              {" "}
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-tertiary font-bold">
                2 VOTING
              </span>
            </div>
            {" "}
            {alexProof && (
              <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface-container shadow-xl relative overflow-clip ring-2 ring-tertiary/40">
                <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary"></div>
                <div className="flex items-center justify-between">
                  <span className="font-headline-sm text-headline-sm text-primary font-bold">You submitted proof</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">just now</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Dare: “Do tomorrow&apos;s standup in a full Caribbean pirate accent.”</p>
                <div className="flex items-center gap-2 p-space-sm rounded-xl bg-surface-container-lowest">
                  <span className="material-symbols-outlined text-tertiary">movie</span>
                  <span className="font-label-sm text-label-sm text-on-surface truncate">{alexProof}</span>
                  <span className="ml-auto font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary font-bold whitespace-nowrap">AI checking…</span>
                </div>
                <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-lowest">
                  {reviewBar({ approved: 0, rejected: 0, mine: null }, "Waiting on 5 votes")}
                </div>
              </div>
            )}
            {/* Card 2.1: Marcus Disney Song Proof */}
            {" "}
            <div className="flex flex-col gap-space-md p-space-md rounded-2xl bg-surface-container-low shadow-md relative overflow-clip">
              <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary"></div>
              {" "}
              {/* Video Thumbnail Preview */}
              {" "}
              <div className="relative w-full h-44 rounded-xl overflow-clip bg-surface-container-lowest group cursor-pointer">
                <img className="w-full h-full object-cover" alt="High-contrast video frame grab of a young man wearing a rainbow clown afro wig standing at a karaoke microphone in a crowded dive bar, neon lights glowing purple and green." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDP0dVc99bg8fMzLtFitAgD5klMDTBo2OHXgjTLBIP6a3yj8EEpePx7ajad9AuUOT-VMSPSzPD9E8lFQCEn5MCU-bEy-oowiiry_NmuUcYK9Yz3aH5aNvy-559faspivnjRxLyyIPIu_nB374Uwjw-orE-7N1GiLpXb9fjW_MrTjmBxGBMkKCorOpberRai_B5WVGtRQMc9Tl7xXBqJ-IVLcjhkz8v4XcUdgCqyy7yZ" />
                {" "}
                <div className="absolute inset-0 bg-surface-container-lowest/40 group-hover:bg-surface-container-lowest/20 transition-colors flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-surface/80 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-primary text-3xl ml-0.5">
                      play_arrow
                    </span>
                  </div>
                </div>
                {" "}
                <span className="absolute bottom-2 left-2 px-space-xs py-0.5 rounded bg-surface/85 font-label-sm text-label-sm text-on-surface font-mono">
                  01:42 HD
                </span>
                {" "}
                <span className="absolute top-2 right-2 px-space-xs py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label-sm text-label-sm font-bold uppercase">
                  AI Analyzed
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Marcus submitted proof
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                    18m ago
                  </span>
                </div>
                {" "}
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Dare: “Sing Disney's Let It Go at bar karaoke wearing clown wig.”
                </p>
              </div>
              {" "}
              {/* Community Voting Bar */}
              {" "}
              <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-lowest">
                {reviewBar(marcus, "1 vote needed to clear")}
                {" "}
                <div className="flex items-center gap-space-xs pt-1">
                  <div className="flex -space-x-1.5 overflow-clip">
                    <div className="inline-block h-5 w-5 rounded-full ring-2 ring-surface bg-primary text-[8px] flex items-center justify-center text-on-primary font-bold">
                      SC
                    </div>
                    {" "}
                    <div className="inline-block h-5 w-5 rounded-full ring-2 ring-surface bg-primary text-[8px] flex items-center justify-center text-on-primary font-bold">
                      DA
                    </div>
                    {" "}
                    <div className="inline-block h-5 w-5 rounded-full ring-2 ring-surface bg-primary text-[8px] flex items-center justify-center text-on-primary font-bold">
                      PR
                    </div>
                    {" "}
                    <div className="inline-block h-5 w-5 rounded-full ring-2 ring-surface bg-primary text-[8px] flex items-center justify-center text-on-primary font-bold">
                      JK
                    </div>
                  </div>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    voted 'Satisfied'
                  </span>
                </div>
              </div>
              {" "}
              {/* Approval Action Row */}
              {voteBtns("marcus", marcus, "Redo 👎")}
            </div>
            {" "}
            {/* Card 2.2: Elena Carolina Reaper Chip */}
            {" "}
            <div className="flex flex-col gap-space-md p-space-md rounded-2xl bg-surface-container-low shadow-md relative overflow-clip">
              <div className="absolute top-0 left-0 right-0 h-1 bg-tertiary/70"></div>
              {" "}
              {/* Image Evidence */}
              {" "}
              <div className="relative w-full h-44 rounded-xl overflow-clip bg-surface-container-lowest">
                <img className="w-full h-full object-cover" alt="Dramatic photo of Elena with teary eyes holding a single black Carolina Reaper tortilla chip next to a half-empty glass of cold whole milk on a kitchen counter, warm studio lighting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuD8X8DhK8AparB1Sc3m7AYqvEjE963-jWLFVGoJBPe9QG1PdO2ZUBnOIiEtVkMqiyE7h3Xf99n1fdY7l0ZmCtWq-rXX3kylW-EH958sW3xwL1VGqxLa24DipTGeUAOaXu7ycAW0tejPVizJlcsVZ8DNatRkoxxKjyeXrw1YyiIJ9AJWngtJ52MAjeOsoV9wGFTnoknaFv87LeCk9K3YLvlH3lUpoBI7G29CnaA23Ae7" />
                {" "}
                <span className="absolute bottom-2 left-2 px-space-xs py-0.5 rounded bg-surface/85 font-label-sm text-label-sm text-on-surface font-mono">
                  Photo + Audio Sync
                </span>
                {" "}
                <span className="absolute top-2 right-2 px-space-xs py-0.5 rounded-full bg-secondary-container text-on-secondary font-label-sm text-label-sm font-bold uppercase">
                  🌶️ Extreme Dare
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Elena ate Carolina Reaper
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-secondary font-mono">
                    6h left
                  </span>
                </div>
                {" "}
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Dare: “Eat 1 Carolina Reaper chip without milk for 3 full minutes.”
                </p>
              </div>
              {" "}
              {/* Community Voting Bar */}
              {" "}
              <div className="flex flex-col gap-space-xs p-space-sm rounded-xl bg-surface-container-lowest">
                {reviewBar(elena, `${5 - elena.approved} votes needed`)}
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  David rejected: “She sipped milk at 02:48!”
                </span>
              </div>
              {" "}
              {/* Approval Action Row */}
              {voteBtns("elena", elena, "Reject 👎")}
            </div>
          </div>
          {" "}
          {/* COLUMN 3: Done & Hall of Fame */}
          {" "}
          <div className="flex flex-col gap-space-md">
            {/* Column Header */}
            {" "}
            <div className="flex items-center justify-between px-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="w-3 h-3 rounded-full bg-primary-container"></span>
                {" "}
                <h3 className="font-headline-sm text-headline-sm text-on-surface uppercase tracking-tight">
                  ✅ Done &amp; Hall of Fame
                </h3>
              </div>
              {" "}
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-bold">
                14 CLEARED
              </span>
            </div>
            {" "}
            {/* Card 3.1: Sam 100 pushups */}
            {" "}
            <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface-container-low shadow-sm hover:bg-surface-container transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="text-xl">
                    🏆
                  </span>
                  {" "}
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      Sam
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-primary font-mono">
                      VERIFIED BY SQUAD
                    </span>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-primary-container/20 text-primary font-bold">
                  Honored
                </span>
              </div>
              {" "}
              <p className="font-body-md text-body-md text-on-surface font-medium">
                Completed: 100 pushups in 10 minutes flat on live gym floor stream.
              </p>
              {" "}
              <div className="flex items-center justify-between pt-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  Settled Bet #8721
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs text-primary">
                    verified_user
                  </span>
                  {" "}5/5 Validated
                </span>
              </div>
            </div>
            {" "}
            {/* Card 3.2: David Shaved Mustache (Hall of Fame) */}
            {" "}
            <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface-container-low shadow-md relative overflow-clip border border-tertiary-container/30">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="text-xl">
                    ⭐
                  </span>
                  {" "}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                        David
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-tertiary-container/30 text-tertiary font-bold uppercase">
                        All-Time Iconic
                      </span>
                    </div>
                    {" "}
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                      Fantasy Football Final 2024
                    </span>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-primary-container/20 text-primary font-bold">
                  Hall of Fame
                </span>
              </div>
              {" "}
              <p className="font-body-md text-body-md text-on-surface font-medium">
                Completed: Shaved off signature 3-year mustache on video after losing championship by 0.4 points.
              </p>
              {" "}
              {/* Attached Mini Media Thumbnail */}
              {" "}
              <div className="flex items-center gap-space-sm p-space-xs rounded-xl bg-surface-container-lowest">
                <div className="w-12 h-12 rounded-lg bg-surface-container overflow-clip flex-shrink-0 relative">
                  <img className="w-full h-full object-cover" alt="Funny close-up screenshot of David with half a mustache shaved off looking directly into camera with mock solemn face." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpkIVk8LyW1RC_D2S_TNQmrrLXG7W-b06CfujZLCHIll8Z2-A2lyc6V4CC1odq4Koai9-ZIXGn1tgLQrmLdsoOBLnAp5OLmi9nUIdU2lLkyJN9Qcm8VO9LXlZ6dErwnTX8N3S7b73dqas9eowec8z61zqnLpFJJxCQ4M84qD5sYpRCTrwtRt-R82cmUHTcd1vK5iSf3EZpEQN382EZhNvwPmwFbyxqQzk1RVuP0Ku9" />
                  {" "}
                  <div className="absolute inset-0 bg-surface/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xs text-on-surface">
                      videocam
                    </span>
                  </div>
                </div>
                {" "}
                <div className="flex flex-col flex-1 truncate">
                  <span className="font-label-sm text-label-sm text-on-surface truncate font-semibold">
                    the_great_shearing.mp4
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    Archived in Group Vault
                  </span>
                </div>
                {" "}
                <div className="flex items-center gap-1 px-space-xs py-0.5 rounded bg-surface-container-high text-xs">
                  <span>
                    😂
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface font-bold">
                    18
                  </span>
                </div>
              </div>
            </div>
            {" "}
            {/* Card 3.3: Jake French Accent */}
            {" "}
            <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface-container-low shadow-sm hover:bg-surface-container transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="text-xl">
                    ☕
                  </span>
                  {" "}
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      Jake
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-primary font-mono">
                      VERIFIED BY SQUAD
                    </span>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-primary-container/20 text-primary font-bold">
                  Honored
                </span>
              </div>
              {" "}
              <p className="font-body-md text-body-md text-on-surface font-medium">
                Completed: Ordered his morning double espresso in a thick Parisian accent for 7 consecutive days at local cafe.
              </p>
              {" "}
              <div className="flex items-center justify-between pt-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  Barista Signed Affidavit
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-tertiary flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">
                    sentiment_very_satisfied
                  </span>
                  {" "}12 Laughs
                </span>
              </div>
            </div>
            {" "}
            {/* Card 3.4: Priya Spoke in Haiku for a Day */}
            {" "}
            <div className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface-container-low shadow-sm hover:bg-surface-container transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="text-xl">
                    📜
                  </span>
                  {" "}
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      Priya
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-primary font-mono">
                      VERIFIED BY SQUAD
                    </span>
                  </div>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded-full bg-primary-container/20 text-primary font-bold">
                  Honored
                </span>
              </div>
              {" "}
              <p className="font-body-md text-body-md text-on-surface font-medium">
                Completed: Communicated strictly in 5-7-5 syllable Haikus on Discord for 24 hours.
              </p>
              {" "}
              <div className="flex items-center justify-between pt-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  Discord Bot Verified
                </span>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  0 Violations
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {" "}
    </main>
  );
}
