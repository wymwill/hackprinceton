"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { GROUP, NAV } from "@/lib/data";
import Avatar from "./Avatar";
import { useHydrated } from "@/lib/bets/format";
import { useBookie } from "./BookieProvider";

/** Left navigation. Fixed on desktop; a drawer on smaller screens. */
export default function Sidebar() {
  const pathname = usePathname();
  const bookie = useBookie();
  const { openCreateBet, navOpen, setNavOpen } = bookie;
  // The sidebar streams in behind a Suspense boundary, so it can hydrate after live
  // data has loaded. Hold that data back until hydration finishes so the first render
  // matches the server HTML, then show it.
  const hydrated = useHydrated();
  const me = hydrated ? bookie.me : null;
  const state = hydrated ? bookie.state : null;
  const members = state?.users ?? [];

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen, setNavOpen]);

  return (
    <>
      {navOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside
        id="app-nav"
        className={`fixed left-0 top-0 h-full w-[260px] bg-surface-container-low z-50 flex flex-col justify-between p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition-transform lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Link href="/" onClick={() => setNavOpen(false)} className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-primary-container text-on-primary flex items-center justify-center text-lg" aria-hidden>
                🎲
              </span>
              <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Bookie</span>
            </Link>
            <button onClick={() => setNavOpen(false)} className="lg:hidden text-on-surface-variant" aria-label="Close menu">
              <span className="material-symbols-outlined block" aria-hidden>
                close
              </span>
            </button>
          </div>

          {/* Group identity, compact */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-container ring-1 ring-[#2f384a]">
            <span className="text-lg" aria-hidden>
              {GROUP.emoji}
            </span>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-label-md text-label-md text-on-surface font-semibold truncate">{GROUP.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="flex -space-x-1.5" aria-hidden>
                  {members.slice(0, 5).map((u) => (
                    <Avatar key={u.id} name={u.name} src={u.avatar} size={16} className="ring-2 ring-surface-container" />
                  ))}
                </span>
                <span className="font-label-sm text-[11px] text-on-surface-variant">{members.length} friends</span>
              </span>
            </div>
          </div>

          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    active ? "bg-primary-container/15 text-primary font-semibold ring-1 ring-primary-container/30" : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="font-body-md text-body-md">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <button
            onClick={() => openCreateBet()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:shadow-[0_0_28px_rgba(52,211,153,0.33)] active:scale-[0.98] transition-all"
          >
            + New market
          </button>
          {me && (
            <Link href="/profile" onClick={() => setNavOpen(false)} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container-lowest">
              <span className="flex items-center gap-2 min-w-0">
                <Avatar name={me.name} src={me.avatar} size={32} />
                <span className="flex flex-col min-w-0">
                  <span className="font-label-md text-label-md text-on-surface font-semibold truncate">{me.name}</span>
                  <span className="font-label-sm text-label-sm text-secondary-fixed-dim truncate">{me.title}</span>
                </span>
              </span>
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm text-primary font-bold">{me.balance.toLocaleString()} P</span>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
