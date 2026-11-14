"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppProvider";

/** The current group with a menu of your other groups, like switching workspaces. */
export default function GroupSwitcher() {
  const { state, open, setNavOpen } = useApp();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const group = state?.group;

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setMenu(!menu)}
        aria-expanded={menu}
        aria-haspopup="menu"
        className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-container ring-1 ring-[#333238] hover:ring-outline-variant text-left"
      >
        <span className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-lg" aria-hidden>
          {group?.emoji ?? "🎲"}
        </span>
        <span className="flex flex-col min-w-0 flex-1">
          <span className="font-label-lg text-label-lg text-on-surface truncate">{group?.name ?? (state ? "Pick a group" : " ")}</span>
          <span className="font-label-sm text-xs text-on-surface-variant">{group ? `${group.members.length} ${group.members.length === 1 ? "member" : "friends"} · ${group.mode === "tokens" ? "Tokens" : "Points"}` : " "}</span>
        </span>
        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
          unfold_more
        </span>
      </button>
      {menu && (
        <div role="menu" className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl bg-surface-container-high ring-1 ring-outline-variant/60 shadow-xl p-1.5 flex flex-col">
          {state?.groups.map((g) => (
            <Link
              key={g.id}
              role="menuitem"
              href={`/g/${g.id}`}
              onClick={() => (setMenu(false), setNavOpen(false))}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-container-highest ${g.id === group?.id ? "text-primary" : "text-on-surface"}`}
            >
              <span aria-hidden>{g.emoji}</span>
              <span className="flex-1 truncate font-body-md text-body-md">{g.name}</span>
              {g.id === group?.id && (
                <span className="material-symbols-outlined text-[18px]" aria-hidden>
                  check
                </span>
              )}
            </Link>
          ))}
          {!!state?.groups.length && <hr className="my-1 border-outline-variant/50" />}
          <button role="menuitem" onClick={() => (setMenu(false), open("create-group"))} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-container-highest text-on-surface text-left">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              add
            </span>
            Create group
          </button>
          <button role="menuitem" onClick={() => (setMenu(false), open("join-group"))} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-surface-container-highest text-on-surface text-left">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              group_add
            </span>
            Join with code
          </button>
        </div>
      )}
    </div>
  );
}
