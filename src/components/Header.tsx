"use client";

import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import BookieMark from "./BookieMark";
import { amount } from "./ui";

const AI_LABEL = {
  claude: { text: "Live", cls: "bg-tertiary-container/15 text-tertiary ring-tertiary-container/40", dot: "bg-tertiary animate-pulse" },
  stub: { text: "Test stub", cls: "bg-tertiary-container/10 text-tertiary/80 ring-tertiary-container/30", dot: "bg-tertiary/60" },
  off: { text: "History only", cls: "bg-surface-container-high text-on-surface-variant ring-outline-variant/40", dot: "bg-outline" },
};

/** Top bar: menu (mobile), the Bookie's status, the Playing as switcher. */
export default function Header() {
  const router = useRouter();
  const { state, member, switchUser, navOpen, setNavOpen, open } = useApp();
  const ai = AI_LABEL[state?.ai.mode ?? "off"];

  return (
    <header className="fixed top-0 left-0 lg:left-[260px] right-0 h-16 bg-surface/85 backdrop-blur-xl z-30 flex items-center gap-3 px-4 lg:px-gutter-desktop">
      <button onClick={() => setNavOpen(!navOpen)} className="lg:hidden p-1.5 rounded-lg text-on-surface hover:bg-surface-container-high" aria-label="Open menu" aria-expanded={navOpen} aria-controls="app-nav">
        <span className="material-symbols-outlined block" aria-hidden>
          menu
        </span>
      </button>
      <span className="lg:hidden font-display italic text-[20px] text-on-surface truncate">{state?.group?.name ?? "Betting with Friends"}</span>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {state && (
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full ring-1 font-label-sm text-label-sm ${ai.cls}`}
            title={state.ai.mode === "claude" ? `The Bookie is using ${state.ai.model}` : state.ai.mode === "off" ? "No Anthropic API key: the Bookie uses history only and never recommends a result" : "Deterministic stand in for tests"}
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
              onChange={async (e) => {
                await switchUser(e.target.value);
                router.refresh();
              }}
              aria-label="Switch who you're playing as"
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
        {member && state?.group && (
          <span className="lg:hidden whitespace-nowrap px-2 py-1 rounded-full bg-surface-container-high font-num text-[12px] text-primary font-bold">{amount(member.balance, state.group.mode)}</span>
        )}
        {state?.group && (
          <button onClick={() => open("new-market")} className="lg:hidden p-1.5 rounded-lg bg-primary-container text-on-primary" aria-label="New market">
            <span className="material-symbols-outlined block" aria-hidden>
              add
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
