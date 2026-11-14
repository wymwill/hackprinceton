"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupNav } from "@/lib/data";
import { useApp } from "./AppProvider";

/** Bottom tab bar on phones, where the thumb is. The sidebar takes over from `lg` up. */
export default function MobileNav() {
  const pathname = usePathname();
  const { state } = useApp();
  const group = state?.group;
  if (!group) return null;

  return (
    <nav
      aria-label="Group"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-container-low/95 backdrop-blur-xl border-t border-outline-variant/40 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {groupNav(group.id).map((item) => {
          const active = item.match(pathname);
          const owed = item.label === "Dares" ? state.dares.filter((d) => d.status === "todo" && d.owedBy === state.me).length : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 h-14 font-label-sm text-[11px] ${active ? "text-primary" : "text-on-surface-variant"}`}
              >
                <span className="material-symbols-outlined text-[24px]" style={active ? { fontVariationSettings: "'FILL' 1" } : undefined} aria-hidden>
                  {item.icon}
                </span>
                {item.label}
                {!!owed && (
                  <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-secondary text-on-secondary text-[10px] leading-4 text-center" aria-label={`${owed} owed`}>
                    {owed}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
