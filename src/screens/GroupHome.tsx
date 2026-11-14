"use client";

import Link from "next/link";
import { useState } from "react";
import { useBookie } from "@/components/BookieProvider";
import Countdown from "@/components/Countdown";
import { ME } from "@/lib/data";

type Msg = { id: number; who: "me" | "bookie"; text: string };

const ROASTS = [
  "Bold words from someone with a 1-5 record on movie predictions. 🎬📉",
  "Noted. I'm adjusting your credibility rating accordingly. 📉🤖",
  "That's a lot of confidence for a man who owes a dare. 👀",
  "Sounds like a bet to me. Want me to set the odds? 🎲",
];

export default function GroupHome() {
  const { toast, openCreateBet } = useBookie();
  const [side, setSide] = useState<null | "fade" | "back">(null);
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [backed, setBacked] = useState<Record<string, boolean>>({});
  const [reactions, setReactions] = useState({ fire: 4, skull: 6 });

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const id = Date.now();
    setMsgs((m) => [...m, { id, who: "me", text }]);
    setDraft("");
    const toBottom = () => setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);
    toBottom();
    setTimeout(() => {
      setMsgs((m) => [...m, { id: id + 1, who: "bookie", text: ROASTS[Math.floor(Math.random() * ROASTS.length)] }]);
      toBottom();
    }, 900);
  };

  const takeSide = (which: "fade" | "back") => {
    setSide(which);
    toast(
      which === "fade"
        ? "✅ 250 pts on No. Bookie: “The safe pick.”"
        : "🚀 250 pts on Yes at 6x. Bookie: “Bold. I love it.”",
      which === "fade" ? "lime" : "purple"
    );
  };

  return (
    <main className="relative pt-16 bg-surface min-h-screen w-full px-gutter-desktop py-space-lg">
      <div className="flex flex-col w-full pb-space-xl">
        {/* Top Stat Cards Bento Banner */}
        {" "}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md mb-space-lg">
          {/* Stat 1: Active Bets */}
          {" "}
          <div className="relative overflow-clip rounded-xl bg-surface-container p-space-md shadow-md transition-all hover:scale-[1.01]">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary/10 blur-xl pointer-events-none"></div>
            {" "}
            <div className="flex items-center justify-between mb-space-xs">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-primary">
                  casino
                </span>
                {" "}Active Bets
              </span>
              {" "}
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-bold shadow-[0_0_12px_rgba(52,211,153,0.17)]">
                +3 today
              </span>
            </div>
            {" "}
            <div className="flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                8
              </span>
              {" "}
              <span className="font-headline-sm text-headline-sm text-on-surface-variant">
                Active
              </span>
            </div>
            {" "}
            <div className="mt-space-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              {" "}
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                2 expiring before 12:00 AM
              </p>
            </div>
          </div>
          {" "}
          {/* Stat 2: Your Win Rate */}
          {" "}
          <div className="relative overflow-clip rounded-xl bg-surface-container p-space-md shadow-md transition-all hover:scale-[1.01]">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary/15 blur-xl pointer-events-none"></div>
            {" "}
            <div className="flex items-center justify-between mb-space-xs">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-primary">
                  trending_up
                </span>
                {" "}Your Win %
              </span>
              {" "}
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                +4.2% vs last week
              </span>
            </div>
            {" "}
            <div className="flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg text-primary font-bold tracking-tight">
                68.4%
              </span>
            </div>
            {" "}
            <div className="mt-space-xs w-full bg-surface-container-highest rounded-full h-1.5 overflow-clip">
              <div className="bg-primary-container h-full rounded-full shadow-[0_0_8px_rgba(52,211,153,0.3)]" style={{ width: "68.4%" }}></div>
            </div>
          </div>
          {" "}
          {/* Stat 3: Rep Points Gain */}
          {" "}
          <div className="relative overflow-clip rounded-xl bg-surface-container p-space-md shadow-md transition-all hover:scale-[1.01]">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-tertiary/10 blur-xl pointer-events-none"></div>
            {" "}
            <div className="flex items-center justify-between mb-space-xs">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-tertiary">
                  bolt
                </span>
                {" "}Points This Week
              </span>
              {" "}
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-tertiary font-bold">
                Rank #2
              </span>
            </div>
            {" "}
            <div className="flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg text-tertiary font-bold tracking-tight">
                +340
              </span>
              {" "}
              <span className="font-headline-sm text-headline-sm text-on-surface-variant">
                PTS
              </span>
            </div>
            {" "}
            <p className="mt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              430 pts behind Marcus
            </p>
          </div>
          {" "}
          {/* Stat 4: Dares Owed */}
          {" "}
          <div className="relative overflow-clip rounded-xl bg-surface-container p-space-md shadow-md transition-all hover:scale-[1.01]">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-secondary-container/20 blur-xl pointer-events-none"></div>
            {" "}
            <div className="flex items-center justify-between mb-space-xs">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-secondary">
                  warning
                </span>
                {" "}Dares Owed
              </span>
              {" "}
              <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-bold shadow-[0_0_10px_rgba(251,113,133,0.15)]">
                Due in 2 days
              </span>
            </div>
            {" "}
            <div className="flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg text-secondary font-bold tracking-tight">
                1
              </span>
              {" "}
              <span className="font-headline-sm text-headline-sm text-on-surface-variant">
                Pending
              </span>
            </div>
            {" "}
            <p className="mt-space-xs font-body-sm text-body-sm text-secondary-fixed-dim">
              Cold plunge video
            </p>
          </div>
        </section>
        {" "}
        {/* 2-Column Responsive Workspace */}
        {" "}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start">
          {/* Center Stream: Group Chat, Live Wagers, & Arbiter (68% approx -> 8 cols on desktop) */}
          {" "}
          <section className="lg:col-span-8 flex flex-col gap-space-md min-w-0">
            {/* Group Master Header Bar */}
            {" "}
            <div className="flex flex-wrap items-center justify-between gap-space-sm p-space-md rounded-xl bg-surface-container-high shadow-md">
              <div className="flex items-center gap-space-sm min-w-0">
                <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center text-xl shrink-0 shadow-sm">
                  🏋️
                </div>
                {" "}
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2 truncate">
                    <h1 className="font-headline-sm text-headline-sm text-on-surface font-bold truncate">
                      The Boyz Gym Arc
                    </h1>
                    {" "}
                    <span className="w-2 h-2 rounded-full bg-primary-container shadow-[0_0_8px_rgba(52,211,153,0.3)] shrink-0"></span>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-xs">
                    {/* Stack of active avatars */}
                    {" "}
                    <div className="flex -space-x-2 overflow-clip py-0.5">
                      <img className="inline-block h-5 w-5 rounded-full ring-2 ring-surface-container-high object-cover" alt="Headshot photo of athletic Asian male gym enthusiast smiling outdoors during golden hour sunlight" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPpC0IK-qem6T5Q6P3b5Zyr8OEOrEycR_0fkdLUmM5imlhDBdv6mBoGSbRRfN7rrmti1ajEJppd52Jc7zU9CZREulFk-NIvX1HyXZ7AceIpeVEJUsEeEbPv1adz4HlaeqWVqCDgJHEyHDudHXCKWWe5C9ruQHo05TFSg0gy-seS71GzlnHNEy8ZzVD1O_9UPsIDuxkJh4IosYOtgJEzV0nXpnQqVm60yTwrDcRPM-h" />
                      {" "}
                      <img className="inline-block h-5 w-5 rounded-full ring-2 ring-surface-container-high object-cover" alt="Portrait photo of a competitive curly-haired man wearing gym apparel in modern neon-lit fitness center" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCa0yxz3a1QyIxqZDP5yI6UPxyCgW6ToYXnsw2RZWfLATKUte1B-s2iWV4qai9FNE-NX76NEn9rNn5-ybGd-bblFXOVR0PkdLTHQhildE2254pVYWVtsQakizyd6jkQacG4HtWceXWbWtayc_UAr4pXP07qL1pr5LnGdpJvy7fiCci5-Koeea3skTVAcekQOZ7By-xa4v0rLe1xfIN5In3DcOy4Qhd_VLcA5ovLKnpb" />
                      {" "}
                      <img className="inline-block h-5 w-5 rounded-full ring-2 ring-surface-container-high object-cover" alt="Profile photo of active female athlete wearing headband in modern weight training gym" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOjaHoRsveirV37gRWNNOhFpYekSuha5-PNYzk_PyXsw2Fz2A3m-hdAz84yXJp6R1d17cZtiUjLiCRazsaAsRPd2AKFy3TCjspepvvn7hOq3fD08N7Bu81YOWUB7ILleGKB5FNhQHmcYY-nbDN7vaPhZq_-uic3gY-b1KQMjayjR_tXkQEZ7g_Cgp8whCS2LPOnAr4ue09OwujNinR1jFLfv5XxCPTafJLng3iUxz3" />
                      {" "}
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-surface-container-highest font-label-sm text-label-sm text-on-surface-variant font-bold ring-2 ring-surface-container-high">
                        +5
                      </span>
                    </div>
                    {" "}
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      • 8 friends in this group
                    </span>
                  </div>
                </div>
              </div>
              {" "}
              <div className="flex items-center gap-space-sm">
                <div className="flex items-center gap-1.5 px-space-sm py-1.5 rounded-lg bg-surface-container-lowest">
                  <span className="material-symbols-outlined text-sm text-primary">
                    savings
                  </span>
                  {" "}
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">
                    Points in play:
                  </span>
                  {" "}
                  <span className="font-label-md text-label-md text-primary font-bold">
                    8,450 pts
                  </span>
                </div>
                {" "}
                <button className="p-2 rounded-lg bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer" title="Squad Settings">
                  <span className="material-symbols-outlined text-lg">
                    settings
                  </span>
                </button>
              </div>
            </div>
            {" "}
            {/* Feed Container */}
            {" "}
            <div className="flex flex-col gap-space-md">
              {/* Feed Item 1: AI Bookie Message Card */}
              {" "}
              <article className="relative overflow-clip rounded-xl bg-surface-container-low p-space-md shadow-md transition-all">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-tertiary"></div>
                {" "}
                <div className="flex items-start gap-space-sm">
                  <div className="w-9 h-9 rounded-lg bg-tertiary-container/30 flex items-center justify-center text-tertiary shrink-0 shadow-[0_0_14px_rgba(211,189,255,0.25)]">
                    <span className="material-symbols-outlined text-lg text-tertiary">
                      smart_toy
                    </span>
                  </div>
                  {" "}
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-space-xs">
                        <span className="font-label-md text-label-md text-tertiary font-bold tracking-wide">
                          AI Bookie
                        </span>
                        {" "}
                        <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-tertiary/15 text-tertiary uppercase font-mono">
                          sets the odds
                        </span>
                      </div>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                        10m ago
                      </span>
                    </div>
                    {" "}
                    <p className="font-body-md text-body-md text-on-surface leading-relaxed">
                      Jake claims 14 gym trips. His app shows{" "}
                      <span className="font-bold text-secondary">
                        2 real sessions
                      </span>
                      . New odds:{" "}
                      <span className="font-label-md text-label-md text-primary font-bold">
                        6 to 1 against
                      </span>
                      . Talk is cheap, Jake. Leg day isn’t. 🦵😅
                    </p>
                    {" "}
                    <div className="mt-space-xs flex items-center gap-2">
                      <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-mono">
                        Source: fitness app
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-mono">
                        99% sure
                      </span>
                    </div>
                  </div>
                </div>
              </article>
              {" "}
              {/* Feed Item 2: Live Bet Card (Centerpiece Interaction) */}
              {" "}
              <article className="relative rounded-2xl bg-surface-container p-space-lg shadow-xl overflow-clip">
                <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none"></div>
                {" "}
                {/* Card Top Row */}
                {" "}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-space-sm">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
                    {" "}
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold font-mono">
                      BET PROPOSAL • EXPIRES IN <Countdown seconds={13692} />
                    </span>
                  </div>
                  {" "}
                  <div className="flex items-center gap-space-xs">
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-primary-container/20 text-primary font-mono font-bold">
                      14% chance
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-mono">
                      #LegDayWakeup
                    </span>
                  </div>
                </div>
                {" "}
                {/* Main Challenge Headline */}
                {" "}
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold leading-snug mb-space-md">
                  <Link href="/bets/8842" className="hover:text-primary transition-colors">
                    Jake makes 6 AM leg day without snoozing.
                  </Link>
                </h2>
                {" "}
                {/* VS Matchup Arena */}
                {" "}
                <div className="grid grid-cols-1 md:grid-cols-11 gap-space-sm items-center p-space-md rounded-xl bg-surface-container-lowest mb-space-md">
                  {/* Side A: Jake */}
                  {" "}
                  <div className="md:col-span-5 flex items-center gap-space-sm">
                    <div className="relative shrink-0">
                      <img className="w-12 h-12 rounded-xl object-cover ring-2 ring-secondary/50" alt="Portrait shot of sleepy young adult man with bedhead yawning in dim bedroom morning lighting" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDnRt7SVywlqeO5s864gZpvayjKMZ7nsi7Cdw6gNVa9zuRcgwRZ9ZGsKVPrHxDXKFdLmi5aErQmvV8i-tnBMhF5vqyZwAnMzv6fONqJpKXNApNrQQ7Bu4V8RF6I_7S-pTb2fkezkiqQxpYWQjQL9cVKG1J_dL2V8C4LZQULxU203MKpzO_TzXlTV-svIgHiU_2HkbzIqpGdt3_5b_xDATGYbuRfnV995OoTXLV0TJxb" />
                      {" "}
                      <span className="absolute -bottom-1 -right-1 text-sm">
                        🦥
                      </span>
                    </div>
                    {" "}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">
                          Jake Miller
                        </span>
                        {" "}
                        <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-surface-container-high text-secondary-fixed-dim font-mono">
                          14% Win
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        "The Snoozer" • going solo
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-secondary font-mono">
                        250 pts on the line
                      </span>
                    </div>
                  </div>
                  {" "}
                  {/* VS Badge Divider */}
                  {" "}
                  <div className="md:col-span-1 flex justify-center py-1 md:py-0">
                    <span className="font-label-md text-label-md text-on-surface-variant font-bold px-2 py-1 rounded bg-surface-container-high">
                      VS
                    </span>
                  </div>
                  {" "}
                  {/* Side B: The Group */}
                  {" "}
                  <div className="md:col-span-5 flex items-center justify-between gap-space-sm">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-label-lg text-label-lg text-primary font-bold truncate">
                          The rest of the group
                        </span>
                        {" "}
                        <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-primary/20 text-primary font-mono">
                          86% Win
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        5 friends betting no
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-primary font-mono">
                        1,500 pts in
                      </span>
                    </div>
                    {" "}
                    {/* Avatar Cluster */}
                    {" "}
                    <div className="flex -space-x-3 overflow-clip shrink-0">
                      <img className="w-10 h-10 rounded-xl object-cover ring-2 ring-surface-container-lowest" alt="Casual profile photo of young athletic Caucasian man smiling in gym apparel" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDhKnSQsDvZVhQSdJ5hycdKjoCcjdCy4JOBtGPiYzSdgdJFn7--xWQaXhUL6N6kr7tmOORJ5_scuN3WuwxMNlb-WA9qvrFGF8BdWj7SbU0Tbr7yNkTGh75wTLoE54-U1at7ZNfHSJRrrXIbqoWrsmCr3iQx-pGY6kUPmjStDVJV0QMhK2uK-ibjsIMW2ApSZMwDob-hE8RLixMXRo4Dr3EFqCK6SS2xN8L-q2Qfuisg" />
                      {" "}
                      <img className="w-10 h-10 rounded-xl object-cover ring-2 ring-surface-container-lowest" alt="Profile photo of South Asian athletic man working out on gym floor" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC5StmYFJcMbKIkVdvsYmt5GDWltCyz_Q8o6s7BeVCRpHWwOTXdmhbqpxfiTaiLYYkSm9XXgHYvxwxqbEyCI4T5C7BrR0UuWjT7IQ08fORyvn1PgsdnyPTLP8UOALF4NmEpHG-hPVoVIAyq0GDw9mKlncWhTZDZ19oIUssE-2zglgVthAHTjbNAzU4K4WVoQy7o744Y2cdPAdz10azLALO8_6XIY_4bjmdiTLmMW6Wn" />
                      {" "}
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center font-label-sm text-label-sm text-on-surface font-bold ring-2 ring-surface-container-lowest">
                        +3
                      </div>
                    </div>
                  </div>
                </div>
                {" "}
                {/* Split Voting & Odds Bar */}
                {" "}
                <div className="flex flex-col gap-1.5 mb-space-md">
                  <div className="flex justify-between font-label-sm text-label-sm font-mono">
                    <span className="text-secondary font-bold">
                      14% say yes (1 friend)
                    </span>
                    {" "}
                    <span className="text-primary font-bold">
                      86% say no (5 friends)
                    </span>
                  </div>
                  {" "}
                  <div className="w-full h-3 rounded-full bg-surface-container-highest overflow-clip flex">
                    <div className="bg-secondary-container h-full transition-all" style={{ width: "14%" }}></div>
                    {" "}
                    <div className="bg-primary-container h-full shadow-[0_0_12px_rgba(52,211,153,0.25)] transition-all" style={{ width: "86%" }}></div>
                  </div>
                </div>
                {" "}
                {/* Stakes & Dare Callout */}
                {" "}
                <div className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm rounded-xl bg-surface-container-high mb-space-md">
                  <div className="flex items-center gap-space-xs min-w-0">
                    <span className="material-symbols-outlined text-secondary text-lg">
                      local_fire_department
                    </span>
                    {" "}
                    <span className="font-body-md text-body-md text-on-surface font-semibold truncate">
                      Loser's dare:{" "}
                      <span className="text-secondary">
                        50 Full Burpees on Zoom with camera on
                      </span>
                    </span>
                  </div>
                  {" "}
                  <div className="flex items-center gap-2">
                    <span className="font-label-sm text-label-sm font-mono text-on-surface-variant">
                      Total in play:
                    </span>
                    {" "}
                    <span className="font-label-md text-label-md text-primary font-bold font-mono">
                      1,750 pts
                    </span>
                  </div>
                </div>
                {" "}
                {/* Interactive Action Buttons */}
                {" "}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                  <button
                    onClick={() => takeSide("fade")}
                    disabled={side !== null}
                    className={`flex items-center justify-center gap-space-xs py-space-sm px-space-md rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:shadow-[0_0_28px_rgba(52,211,153,0.33)] hover:scale-[1.01] active:scale-[0.99] transition-all disabled:hover:scale-100 ${side === "back" ? "opacity-40" : ""}`}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {side === "fade" ? "check_circle" : "thumb_down"}
                    </span>
                    {" "}
                    <span>
                      {side === "fade" ? "You bet No · 250 pts" : "Bet No · he snoozes"}
                    </span>
                  </button>
                  {" "}
                  <button
                    onClick={() => takeSide("back")}
                    disabled={side !== null}
                    className={`flex items-center justify-center gap-space-xs py-space-sm px-space-md rounded-xl font-headline-sm text-headline-sm font-semibold transition-all ${side === "back" ? "bg-tertiary-container text-on-tertiary-container shadow-[0_0_20px_rgba(167,139,250,0.2)]" : "bg-surface-container-highest text-on-surface hover:bg-surface-bright"} ${side === "fade" ? "opacity-40" : ""}`}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {side === "back" ? "check_circle" : "rocket_launch"}
                    </span>
                    {" "}
                    <span>
                      {side === "back" ? "You bet Yes · pays 6x" : "Bet Yes · pays 6x"}
                    </span>
                  </button>
                </div>
              </article>
              {" "}
              {/* Feed Item 3: Friend Chat Bubble */}
              {" "}
              <article className="flex items-start gap-space-sm max-w-2xl">
                <img className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" alt="Headshot of friendly athletic young man wearing gym hoodie outdoors" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAnvRj4yYBiMHqUsEFiwqh_fnn7qG-VbT9VNqNJANIWbbQ2CvpkxqKvSa1tk7ni1NmfoDrInbtH9WTzG92v0NOp46p55cMVioPF_pDQlA2VKi3CV3Ma3uRZYrX0B8ySHRLu7M4moGGDc5_RGpJTEWNzHm012EnBR_BlAw1G5JWZBwnQHWWnOIsvzA-mYeWahXdImh6SUHo1qNvvV63hs7JkgMtKTXmfYo6A28tn3E27" />
                {" "}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-label-md text-label-md text-on-surface font-bold">
                      Marcus Vance
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-semibold">
                      #1 this week
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                      7m ago
                    </span>
                  </div>
                  {" "}
                  <div className="p-space-md rounded-2xl rounded-tl-sm bg-surface-container text-on-surface shadow-sm font-body-md text-body-md">
                    500 on Jake staying in bed. He hasn't seen 6 AM since 2019 😂
                  </div>
                  {" "}
                  <div className="flex items-center gap-2 pl-2">
                    <button className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors cursor-pointer" onClick={() => setReactions((r) => ({ ...r, fire: r.fire + 1 }))}>
                      <span>
                        🔥
                      </span>
                      {" "}{reactions.fire}
                    </button>
                    {" "}
                    <button className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant hover:text-secondary transition-colors cursor-pointer" onClick={() => setReactions((r) => ({ ...r, skull: r.skull + 1 }))}>
                      <span>
                        😂
                      </span>
                      {" "}{reactions.skull}
                    </button>
                    {" "}
                    <button className="font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface cursor-pointer ml-2">
                      Reply
                    </button>
                  </div>
                </div>
              </article>
              {" "}
              {/* Feed Item 4: Resolved Bet Flash Banner */}
              {" "}
              <article className="relative overflow-clip rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                <div className="flex items-center gap-space-sm">
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-xl">
                      verified
                    </span>
                  </div>
                  {" "}
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-primary-container text-on-primary font-mono font-bold">
                        SETTLED
                      </span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                        Checked by the Bookie · 22m ago
                      </span>
                    </div>
                    {" "}
                    <p className="font-body-md text-body-md text-on-surface mt-0.5 truncate">
                      <span className="font-bold text-on-surface">
                        Marcus
                      </span>
                      {" "}broke his 5km PR before midnight (21:42)!{" "}
                      <span className="text-primary font-bold">
                        +150 pts
                      </span>
                      {" "}went to 4 winners.
                    </p>
                  </div>
                  {" "}
                  <Link href="/receipts/8704" className="hidden sm:flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors shrink-0">
                    <span>
                      View Proof
                    </span>
                    {" "}
                    <span className="material-symbols-outlined text-sm">
                      open_in_new
                    </span>
                  </Link>
                </div>
              </article>
              {msgs.map((m) =>
                m.who === "me" ? (
                  <article key={m.id} className="flex items-start gap-space-sm max-w-2xl self-end flex-row-reverse">
                    <img className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" alt={ME.name} src={ME.avatar} />
                    <div className="flex flex-col gap-1 items-end">
                      <span className="font-label-md text-label-md text-on-surface font-bold">{ME.name}</span>
                      <div className="p-space-md rounded-2xl rounded-tr-sm bg-primary-container/15 border border-primary-container/30 text-on-surface font-body-md text-body-md">
                        {m.text}
                      </div>
                    </div>
                  </article>
                ) : (
                  <article key={m.id} className="relative overflow-clip rounded-xl bg-surface-container-low p-space-md border-l-4 border-tertiary-container shadow-[0_0_20px_rgba(167,139,250,0.06)]">
                    <div className="flex items-start gap-space-sm">
                      <span className="w-9 h-9 shrink-0 rounded-lg bg-on-tertiary-container/40 flex items-center justify-center">🤖</span>
                      <div className="flex flex-col gap-1">
                        <span className="font-label-md text-label-md text-tertiary font-bold">BOOKIE BOT</span>
                        <p className="font-body-md text-body-md text-tertiary/90">{m.text}</p>
                      </div>
                    </div>
                  </article>
                )
              )}
            </div>
            {" "}
            {/* Center Feed Bottom Composer Tray */}
            {" "}
            <div className="sticky bottom-4 z-20 mt-space-md p-space-sm rounded-2xl bg-surface-container-high/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-space-xs">
                {/* Quick Attach Actions */}
                {" "}
                <div className="flex items-center gap-1">
                  <button className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer" title="Attach Media Proof">
                    <span className="material-symbols-outlined text-lg">
                      attach_file
                    </span>
                  </button>
                  {" "}
                  <button className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer" title="Add Emoji Reaction">
                    <span className="material-symbols-outlined text-lg">
                      add_reaction
                    </span>
                  </button>
                  {" "}
                  <button className="hidden sm:flex p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors cursor-pointer" title="Sync Telemetry Tracker">
                    <span className="material-symbols-outlined text-lg">
                      watch
                    </span>
                  </button>
                </div>
                {" "}
                {/* Text Input Field */}
                {" "}
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} className="flex-1 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant px-space-md py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-container font-body-md text-body-md" placeholder="Trash talk or propose something crazy..." type="text" />
                {" "}
                {/* Fast Bet CTA Button */}
                {" "}
                <button onClick={() => { openCreateBet(draft); setDraft(""); }} className="flex items-center gap-space-xs px-space-md py-2.5 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_18px_rgba(52,211,153,0.2)] hover:shadow-[0_0_24px_rgba(52,211,153,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap">
                  <span>
                    Make it a bet
                  </span>
                  {" "}
                  <span className="text-base">
                    🎲
                  </span>
                </button>
              </div>
            </div>
          </section>
          {" "}
          {/* Right Rail: Live Bets, Leaderboard, & Urgent Dares (32% -> 4 cols on desktop) */}
          {" "}
          <aside className="lg:col-span-4 flex flex-col gap-space-lg min-w-0">
            {/* Section 1: Live Bets in Group */}
            {" "}
            <section className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface-container shadow-md">
              <div className="flex items-center justify-between pb-space-xs">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-base">
                    local_fire_department
                  </span>
                  {" "}
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Open bets
                  </h3>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-mono font-bold">
                  3 open
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-space-sm">
                {/* Live Mini Bet 1 */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-label-sm text-secondary font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                      {" "}01h 14m left
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-primary/20 text-primary font-mono font-bold">
                      2.4:1
                    </span>
                  </div>
                  {" "}
                  <p className="font-body-md text-body-md text-on-surface font-semibold truncate mb-2">
                    Dave bench presses 225 lbs for 5 clean reps
                  </p>
                  {" "}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Pool: 640 PTS
                      </span>
                      {" "}
                      <span className="w-1 h-1 rounded-full bg-on-surface-variant"></span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        4 Backers
                      </span>
                    </div>
                    {" "}
                    <button onClick={() => { setBacked((b) => ({ ...b, dave: true })); toast("🤝 You're in for 50 pts.", "lime"); }} disabled={backed.dave} className={backed.dave ? "px-space-sm py-1 rounded-lg bg-primary/20 text-primary font-label-md text-label-md font-bold" : "px-space-sm py-1 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-bold hover:scale-105 active:scale-95 transition-all cursor-pointer"}>
                      {backed.dave ? "In ✓" : "Join"}
                    </button>
                  </div>
                </div>
                {" "}
                {/* Live Mini Bet 2 */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      {" "}05h 40m left
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-primary/20 text-primary font-mono font-bold">
                      1.8:1
                    </span>
                  </div>
                  {" "}
                  <p className="font-body-md text-body-md text-on-surface font-semibold truncate mb-2">
                    Sam drinks 1 gallon of water before 8 PM
                  </p>
                  {" "}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Pool: 320 PTS
                      </span>
                      {" "}
                      <span className="w-1 h-1 rounded-full bg-on-surface-variant"></span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        6 Backers
                      </span>
                    </div>
                    {" "}
                    <button onClick={() => { setBacked((b) => ({ ...b, sam: true })); toast("🤝 You're in for 50 pts.", "lime"); }} disabled={backed.sam} className={backed.sam ? "px-space-sm py-1 rounded-lg bg-primary/20 text-primary font-label-md text-label-md font-bold" : "px-space-sm py-1 rounded-lg bg-surface-container-highest text-on-surface font-label-md text-label-md font-bold hover:bg-surface-bright transition-all cursor-pointer"}>
                      {backed.sam ? "In ✓" : "Join"}
                    </button>
                  </div>
                </div>
                {" "}
                {/* Live Mini Bet 3 */}
                {" "}
                <div className="p-space-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-label-sm text-label-sm text-secondary font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                      {" "}08h 12m left
                    </span>
                    {" "}
                    <span className="font-label-sm text-label-sm px-1.5 py-0.2 rounded bg-tertiary-container/30 text-tertiary font-mono font-bold">
                      5.0:1
                    </span>
                  </div>
                  {" "}
                  <p className="font-body-md text-body-md text-on-surface font-semibold truncate mb-2">
                    Alex skips post-workout protein shake today
                  </p>
                  {" "}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Pool: 900 PTS
                      </span>
                      {" "}
                      <span className="w-1 h-1 rounded-full bg-on-surface-variant"></span>
                      {" "}
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        3 Backers
                      </span>
                    </div>
                    {" "}
                    <button onClick={() => { setBacked((b) => ({ ...b, alex: true })); toast("🤝 You're in for 50 pts.", "lime"); }} disabled={backed.alex} className={backed.alex ? "px-space-sm py-1 rounded-lg bg-primary/20 text-primary font-label-md text-label-md font-bold" : "px-space-sm py-1 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md font-bold hover:scale-105 active:scale-95 transition-all cursor-pointer"}>
                      {backed.alex ? "In ✓" : "Join"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
            {" "}
            {/* Section 2: Mini Leaderboard */}
            {" "}
            <section className="flex flex-col gap-space-sm p-space-md rounded-2xl bg-surface-container shadow-md">
              <div className="flex items-center justify-between pb-space-xs">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-base">
                    trophy
                  </span>
                  {" "}
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    This week's top
                  </h3>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-mono">
                  Week 8
                </span>
              </div>
              {" "}
              <div className="flex flex-col gap-1.5">
                {/* Rank 1: Marcus */}
                {" "}
                <div className="flex items-center justify-between p-space-sm rounded-xl bg-surface-container-high">
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span className="w-5 text-center font-label-md text-label-md font-bold text-primary">
                      1
                    </span>
                    {" "}
                    <img className="w-8 h-8 rounded-full object-cover shrink-0" alt="Portrait of fit smiling man Marcus in black athletic tank top" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDoSSt0TrFPcU2yY8QcXif8JmHQj1O1tarcXZaEHFedsWmbCuTTb9N1M3nvB7G4cZ8QVB7_tJB7Or0H6GehGGNHK_00DL--wmRutP15kFZxaIJXjZeWtI81miNm4YpRPQJlzmu2T_4szSKZHSniVmbKB-S9CUBJ3NG46It8kINLr3Oq1dDFtDBp9P_9Ievqtt9tAHMAqmkvUsOsTU7_bjEnHIGdZU502DjZsMqA0jLe" />
                    {" "}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1 truncate">
                        <span className="font-label-md text-label-md text-on-surface font-bold truncate">
                          Marcus V.
                        </span>
                        {" "}
                        <span className="text-xs">
                          🔥
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        8 wins in a row · 79% right
                      </span>
                    </div>
                  </div>
                  {" "}
                  <span className="font-label-md text-label-md text-primary font-bold font-mono whitespace-nowrap">
                    2,840 PTS
                  </span>
                </div>
                {" "}
                {/* Rank 2: Alex (Current User) */}
                {" "}
                <div className="flex items-center justify-between p-space-sm rounded-xl bg-primary-container/10">
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span className="w-5 text-center font-label-md text-label-md font-bold text-primary">
                      2
                    </span>
                    {" "}
                    <img className="w-8 h-8 rounded-full object-cover shrink-0" alt="Profile headshot of athletic male user Alex Chen outdoors looking determined" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAhXQesHpIQpYcxI_wgFlMHUP8Z0cobPBKy580zeMH1hNUpXIOfWAwJGiGrgZJjruV8MSeb-OyTSI8NLwScmZZ88zwfQH_lWiASQwWLa-K-o9QyiuTQ66dByOGbaZCoIi2AsEVP6Y1j7hzbz1DKaY9haH5xOdNy_UtHTwKFoq5FIOOITbfIf2SbdN46TtLzS_eXF_HC-mrts6OekQMC3UyiDNK6s-n-uN0Q7eLZtEjj" />
                    {" "}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1 truncate">
                        <span className="font-label-md text-label-md text-on-surface font-bold truncate">
                          Alex Chen (You)
                        </span>
                        {" "}
                        <span className="font-label-sm text-label-sm px-1 rounded bg-primary-container text-on-primary font-bold font-mono">
                          YOU
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-primary font-mono truncate">
                        68% right
                      </span>
                    </div>
                  </div>
                  {" "}
                  <span className="font-label-md text-label-md text-primary font-bold font-mono whitespace-nowrap">
                    2,410 PTS
                  </span>
                </div>
                {" "}
                {/* Rank 3: Priya */}
                {" "}
                <div className="flex items-center justify-between p-space-sm rounded-xl bg-surface-container-low">
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span className="w-5 text-center font-label-md text-label-md font-bold text-on-surface-variant">
                      3
                    </span>
                    {" "}
                    <img className="w-8 h-8 rounded-full object-cover shrink-0" alt="Portrait photo of energetic female runner Priya smiling in sportswear" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBMC_ojXuP5Q5GcnybM9FEEQ4-sH86OxPaqFyIT5OXyNF50kbADNUXQHPZdj_sYpTgG3yfqer-tJgydsmSvKY3EpsfnL4mxI7uTdrQ4hg-hiWOI6Z4c1HZGWmm8lM-k3INzHsYUkmP8bynJDOsq7zJALWrTNtnEazN5lYuGL7TRhJ_MLaLbl7WVuP4yynNAd8M87_-bj7s1SiGwYm0BHwtj8-GLUHvGLNClnw7BsBvI" />
                    {" "}
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-bold truncate">
                        Priya Patel
                      </span>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        5 wins in a row
                      </span>
                    </div>
                  </div>
                  {" "}
                  <span className="font-label-md text-label-md text-on-surface font-bold font-mono whitespace-nowrap">
                    1,980 PTS
                  </span>
                </div>
                {" "}
                {/* Rank 4: Jake (Bottom) */}
                {" "}
                <div className="flex items-center justify-between p-space-sm rounded-xl bg-surface-container-low">
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span className="w-5 text-center font-label-md text-label-md font-bold text-secondary">
                      8
                    </span>
                    {" "}
                    <img className="w-8 h-8 rounded-full object-cover shrink-0" alt="Profile photo of sleepy young man Jake Miller with backwards cap looking unbothered" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5xUrnWUSx5KqtfG-rhAJQsEvdlAv2t_AvEcwgM1_7XN-gCKC9YPIsQCxp1cduIRQP8vh2GEoFyxWe29muVIh66YrVShRtV0w-Ih-jtO8WRcCWAN6rbHC65dqMDqlyIC-zmEu00adnbzRj_vseS7ppaSgIs3Vk7axnJObheLqjl5vcKUp1GkEC11lysmpIa3fBGLa5TqRqlkzc2FgTPn-ktZNw_VbRYHuxdmsTFCLp" />
                    {" "}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1 truncate">
                        <span className="font-label-md text-label-md text-secondary font-bold truncate">
                          Jake Miller
                        </span>
                        {" "}
                        <span className="text-xs">
                          😴
                        </span>
                      </div>
                      {" "}
                      <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                        Rough week
                      </span>
                    </div>
                  </div>
                  {" "}
                  <span className="font-label-md text-label-md text-secondary font-bold font-mono whitespace-nowrap">
                    420 PTS
                  </span>
                </div>
              </div>
              {" "}
              <Link className="flex items-center justify-center gap-1 pt-space-xs font-label-sm text-label-sm text-primary hover:underline font-bold transition-all" href="/leaderboard">
                <span>
                  See full leaderboard
                </span>
                {" "}
                <span className="material-symbols-outlined text-sm">
                  arrow_forward
                </span>
              </Link>
            </section>
            {" "}
            {/* Section 3: Urgent Dares Card */}
            {" "}
            <section className="relative overflow-clip rounded-2xl bg-surface-container p-space-md shadow-md">
              <div className="flex items-center justify-between mb-space-sm">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary text-base">
                    emergency_home
                  </span>
                  {" "}
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Dares due soon
                  </h3>
                </div>
                {" "}
                <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-mono font-bold shadow-[0_0_8px_rgba(251,113,133,0.15)]">
                  18h left
                </span>
              </div>
              {" "}
              <div className="p-space-md rounded-xl bg-surface-container-low mb-space-sm">
                <div className="flex items-center gap-space-xs mb-2">
                  <img className="w-6 h-6 rounded-full object-cover" alt="Headshot of guy Jake Miller with sheepish expression on his face" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC0envocG2-dYewfrwk4f_Xw5e8fbUI6snSURrSguf30lHdlnitt2iPb-bRxceapEDcRVBQw5ySQQ17Zwvg5C0BO0WDtB--DH023XPZOxOSJGkA-Wg1C-3IR9L5YwlqK9OhmnPdIjJtj-1VlK14FgxKSXQHJ5UUps5_4KszZaCERrhWKs9CdNVMqijq_DYMbXhKxEvXOKvNtcDYaiFbDIGSSzic2SmKVfOrPHeH38np" />
                  {" "}
                  <span className="font-label-sm text-label-sm text-secondary font-bold">
                    Jake owes the group:
                  </span>
                </div>
                {" "}
                <p className="font-body-lg text-body-lg text-on-surface font-bold leading-tight mb-2">
                  "Sing a love song at Saturday gym karaoke"
                </p>
                {" "}
                <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
                  <span>
                    From: the 315 lb squat bet
                  </span>
                  {" "}
                  <span className="text-secondary font-bold font-mono">
                    Needs a video
                  </span>
                </div>
              </div>
              {" "}
              <button onClick={() => toast("📣 Proof demanded. Jake has been publicly pinged. 18h on the clock.", "coral")} className="w-full flex items-center justify-center gap-space-xs py-2 rounded-xl bg-surface-container-highest text-on-surface font-label-md text-label-md font-bold hover:bg-surface-bright transition-all cursor-pointer">
                <span className="material-symbols-outlined text-sm">
                  flag
                </span>
                {" "}
                <span>
                  Nudge Jake
                </span>
              </button>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
