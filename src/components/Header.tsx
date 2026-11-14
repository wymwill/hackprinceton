"use client";

import { useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import Avatar from "./Avatar";
import { amount } from "./ui";

/** Top bar: menu (mobile), and who you are: your account, or the Playing as switcher in demo mode. */
export default function Header() {
  const router = useRouter();
  const { state, me, member, switchUser, navOpen, setNavOpen } = useApp();

  return (
    <header className="fixed top-0 left-0 lg:left-[260px] right-0 h-16 bg-surface/85 backdrop-blur-xl z-30 flex items-center gap-3 px-4 lg:px-gutter-desktop">
      <button onClick={() => setNavOpen(!navOpen)} className="lg:hidden p-1.5 rounded-lg text-on-surface hover:bg-surface-container-high" aria-label="Open menu" aria-expanded={navOpen} aria-controls="app-nav">
        <span className="material-symbols-outlined block" aria-hidden>
          menu
        </span>
      </button>
      <span className="lg:hidden font-display italic text-[20px] text-on-surface truncate">Alea</span>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {state && me && state.auth.mode !== "demo" && (
          <form action="/auth/signout" method="post" className="flex items-center gap-2 pl-1 pr-1 py-1 rounded-full bg-surface-container-high">
            <Avatar name={me.name} src={me.avatarUrl} size={26} />
            <span className="hidden sm:inline font-label-md text-label-md text-on-surface max-w-[8rem] truncate">{me.name.split(" ")[0]}</span>
            <button type="submit" className="px-2 py-0.5 rounded-full font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest" aria-label={`Sign out ${me.name}`}>
              Sign out
            </button>
          </form>
        )}
        {state && state.auth.mode === "demo" && (
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
      </div>
    </header>
  );
}
