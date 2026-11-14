"use client";

import { useBookie } from "./BookieProvider";

export default function Header() {
  const { toast, state, switchUser } = useBookie();
  return (
    <header className="fixed top-0 left-[260px] right-0 h-16 bg-surface/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex items-center justify-between px-gutter-desktop">
      <div className="flex items-center gap-space-md flex-1 max-w-xl">
        <div className="relative w-full flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-on-surface-variant">search</span>
          <input
            className="w-full bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant pl-10 pr-4 py-space-xs rounded-xl border border-outline-variant/30 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container font-body-sm text-body-sm"
            placeholder="Search bets, friends, dares..."
            type="text"
          />
        </div>
        <div className="hidden xl:flex items-center gap-space-xs px-space-sm py-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest transition-colors">
          <span className="text-xs">🔥</span>
          <span className="font-label-sm text-label-sm text-on-surface whitespace-nowrap">The Boyz Gym Arc</span>
          <span className="material-symbols-outlined text-xs text-on-surface-variant">expand_more</span>
        </div>
      </div>
      <div className="flex items-center gap-space-md">
        {state && (
          <label className="flex items-center gap-1.5 px-space-sm py-1 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant">
            <span className="whitespace-nowrap">Playing as</span>
            <select
              value={state.me}
              onChange={(e) => switchUser(e.target.value)}
              aria-label="Switch which friend you're playing as"
              className="bg-transparent text-on-surface font-semibold outline-none cursor-pointer"
            >
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => toast("🔔 Jake joined your bet on leg day.", "lime")}
          className="relative p-space-xs rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary shadow-[0_0_6px_rgba(217,163,95,0.4)]" />
        </button>
      </div>
    </header>
  );
}
