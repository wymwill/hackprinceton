"use client";

import Link from "next/link";
import { useBookie } from "./BookieProvider";
import BookieMark from "./market/BookieMark";
import AuthControl from "./AuthControl";

const AI_LABEL = {
  claude: { text: "Live", cls: "bg-tertiary-container/15 text-tertiary ring-tertiary-container/40", dot: "bg-tertiary animate-pulse" },
  stub: { text: "Test stub", cls: "bg-[#fbbf77]/15 text-[#fcd5a4] ring-[#fbbf77]/40", dot: "bg-[#fbbf77]" },
  off: { text: "Offline · history only", cls: "bg-surface-container-high text-on-surface-variant ring-outline-variant/40", dot: "bg-outline" },
};

/** Top bar: menu (mobile), AI status, demo user switcher, balance. */
export default function Header() {
  const { state, me, switchUser, navOpen, setNavOpen, openCreateBet } = useBookie();
  const ai = AI_LABEL[state?.ai.mode ?? "off"];

  return (
    <header className="fixed top-0 left-0 lg:left-[260px] right-0 h-16 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-30 flex items-center gap-3 px-4 lg:px-gutter-desktop">
      <button
        onClick={() => setNavOpen(!navOpen)}
        className="lg:hidden p-1.5 rounded-lg text-on-surface hover:bg-surface-container-high"
        aria-label="Open menu"
        aria-expanded={navOpen}
        aria-controls="app-nav"
      >
        <span className="material-symbols-outlined block" aria-hidden>
          menu
        </span>
      </button>
      <Link href="/" className="lg:hidden flex items-center gap-1.5 font-headline-sm text-headline-sm text-on-surface">
        <span aria-hidden>🎲</span> Bookie
      </Link>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <AuthControl />
        {state && (
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full ring-1 font-label-sm text-label-sm ${ai.cls}`}
            title={state.ai.mode === "claude" ? `AI Bookie is using ${state.ai.model}` : state.ai.mode === "off" ? "No Anthropic API key: odds use stored history only and reviews never recommend" : "Deterministic stand-in for tests"}
          >
            <BookieMark size="xs" label={false} />
            <span className={`w-1.5 h-1.5 rounded-full ${ai.dot}`} aria-hidden />
            {ai.text}
          </span>
        )}
        {state && (
          <label className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant">
            <span className="hidden md:inline whitespace-nowrap">Playing as</span>
            <select
              value={state.me}
              onChange={(e) => switchUser(e.target.value)}
              aria-label="Switch which friend you're playing as (demo)"
              className="bg-transparent text-on-surface font-semibold outline-none cursor-pointer max-w-[8.5rem]"
            >
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {me && (
          <span className="lg:hidden whitespace-nowrap px-2 py-1 rounded-full bg-surface-container-high font-label-sm text-label-sm text-primary font-bold" title="Your balance">
            {me.balance.toLocaleString()} P
          </span>
        )}
        <button onClick={() => openCreateBet()} className="lg:hidden p-1.5 rounded-lg bg-primary-container text-on-primary" aria-label="New market">
          <span className="material-symbols-outlined block" aria-hidden>
            add
          </span>
        </button>
      </div>
    </header>
  );
}
