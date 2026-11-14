"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GROUPS, ME, NAV } from "@/lib/data";
import { useBookie } from "./BookieProvider";

export default function Sidebar() {
  const pathname = usePathname();
  const { openCreateBet, toast } = useBookie();
  const [activeGroup, setActiveGroup] = useState(GROUPS[0].id);

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-surface-container-low z-50 flex flex-col justify-between p-space-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-space-lg">
        <Link href="/" className="flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <span className="w-8 h-8 rounded-xl bg-primary-container text-on-primary flex items-center justify-center text-lg">
              🎲
            </span>
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Bookie</span>
          </div>
          <span className="font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-tertiary-container/15 text-tertiary border border-tertiary-container/25">
            AI Bookie
          </span>
        </Link>

        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center justify-between px-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">Your groups</span>
            <span className="material-symbols-outlined text-sm text-on-surface-variant">tune</span>
          </div>
          <div className="flex flex-col gap-1">
            {GROUPS.map((g) => {
              const active = g.id === activeGroup;
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveGroup(g.id)}
                  className={`flex items-center justify-between p-space-sm rounded-lg text-left transition-colors ${
                    active ? "bg-surface-container-high" : "hover:bg-surface-container"
                  }`}
                >
                  <div className="flex items-center gap-space-sm truncate">
                    <span className="text-sm">{g.emoji}</span>
                    <div className="flex flex-col truncate">
                      <span
                        className={`font-label-md text-label-md truncate ${active ? "text-on-surface font-semibold" : "text-on-surface-variant"}`}
                      >
                        {g.name}
                      </span>
                      {active && (
                        <span className="font-body-sm text-body-sm text-on-surface-variant">{g.members} members active</span>
                      )}
                    </div>
                  </div>
                  {active ? (
                    <span className="w-2 h-2 rounded-full bg-primary-container shadow-[0_0_8px_rgba(52,211,153,0.3)]" />
                  ) : g.unread > 0 ? (
                    <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-bold">
                      {g.unread}
                    </span>
                  ) : null}
                </button>
              );
            })}
            <button
              onClick={() => toast("New group invite link copied. Bring your most confident friends. 🔗", "lime")}
              className="flex items-center justify-center gap-space-xs p-space-sm rounded-lg border border-dashed border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span className="font-label-md text-label-md">New Group</span>
            </button>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-all ${
                  active
                    ? "bg-primary-container/15 text-primary font-semibold ring-1 ring-primary-container/30"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-body-md text-body-md">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-space-md pt-space-md">
        <button
          onClick={() => openCreateBet()}
          className="w-full flex items-center justify-center gap-space-xs py-space-sm px-space-md rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-[0_0_20px_rgba(52,211,153,0.2)] hover:shadow-[0_0_28px_rgba(52,211,153,0.33)] hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <span>+ Create Bet</span>
          <span className="text-base">🎲</span>
        </button>
        <Link href="/profile" className="flex items-center justify-between p-space-sm rounded-xl bg-surface-container-lowest">
          <div className="flex items-center gap-space-sm truncate">
            <img alt="Profile" className="w-8 h-8 rounded-full object-cover" src={ME.avatar} />
            <div className="flex flex-col truncate">
              <span className="font-label-md text-label-md text-on-surface font-semibold truncate">{ME.name}</span>
              <span className="font-label-sm text-label-sm text-secondary-fixed-dim truncate">{ME.title}</span>
            </div>
          </div>
          <div className="flex items-center px-space-xs py-0.5 rounded-full bg-surface-container-high">
            <span className="font-label-sm text-label-sm text-primary font-bold">{ME.points.toLocaleString()} P</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
