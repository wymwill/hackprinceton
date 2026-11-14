"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { groupNav } from "@/lib/data";
import { useApp } from "./AppProvider";
import Avatar from "./Avatar";
import GroupSwitcher from "./GroupSwitcher";
import { amount } from "./ui";

/** Left navigation. Fixed on desktop; a drawer on smaller screens. */
export default function Sidebar() {
  const pathname = usePathname();
  const { state, me, member, navOpen, setNavOpen, open } = useApp();
  const group = state?.group;

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
        className={`fixed left-0 top-0 h-full w-[260px] bg-surface-container-low z-50 flex flex-col justify-between p-4 transition-transform lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Link href="/" onClick={() => setNavOpen(false)} className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-primary-container text-on-primary flex items-center justify-center text-lg" aria-hidden>
                <span className="material-symbols-outlined text-[20px]">casino</span>
              </span>
              <span className="font-display italic text-[22px] leading-none text-on-surface">Betting with Friends</span>
            </Link>
            <button onClick={() => setNavOpen(false)} className="lg:hidden text-on-surface-variant" aria-label="Close menu">
              <span className="material-symbols-outlined block" aria-hidden>
                close
              </span>
            </button>
          </div>

          <GroupSwitcher />

          {group && (
            <nav aria-label="Group" className="flex flex-col gap-1">
              {groupNav(group.id).map((item) => {
                const active = item.match(pathname);
                const owed = item.label === "Dares" ? state?.dares.filter((d) => d.status === "todo" && d.owedBy === state.me).length : 0;
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
                    <span className="font-body-md text-body-md flex-1">{item.label}</span>
                    {!!owed && <span className="px-1.5 rounded-full bg-secondary text-on-secondary font-label-sm text-xs">{owed}</span>}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-4">
          {group && (
            <button
              onClick={() => open("new-market")}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_20px_rgba(206,76,59,0.2)] hover:shadow-[0_0_28px_rgba(206,76,59,0.33)] active:scale-[0.98] transition-all"
            >
              + New market
            </button>
          )}
          {me && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container-lowest">
              <span className="flex items-center gap-2 min-w-0">
                <Avatar name={me.name} size={32} />
                <span className="flex flex-col min-w-0">
                  <span className="font-label-md text-label-md text-on-surface font-semibold truncate">{me.name}</span>
                  <span className="font-label-sm text-xs text-on-surface-variant truncate">Playing as</span>
                </span>
              </span>
              {member && group && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-surface-container-high font-num text-[12px] text-primary font-bold" title={group.mode === "tokens" ? "Your tokens" : "Your points"}>
                  {amount(member.balance, group.mode)}
                </span>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
