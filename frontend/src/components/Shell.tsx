import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useMatch, useNavigate } from "react-router-dom";
import { balances, isParticipant, participantIds, standings } from "../lib/rules.ts";
import { fmt, ordinal } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import { useTheme } from "../lib/theme.ts";
import { useCredits } from "../lib/credits.ts";
import type { Series } from "../lib/types.ts";
import { Avatar, Modal, Toasts } from "./ui.tsx";

/** "ABC123", or an invite link ending in /join/ABC123. */
export const codeFrom = (input: string) => (input.trim().match(/\/join\/([A-Za-z0-9]+)\/?$/)?.[1] ?? input).trim().toUpperCase();

export function JoinModal({ onClose }: { onClose: () => void }) {
  const { api } = useStore();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  return (
    <Modal kicker="Join a series" title="Enter the invite code" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const s = await api.joinByCode(codeFrom(code), "You're in. Review the rules in the lobby.");
          if (s) {
            onClose();
            nav(`/s/${s.id}`);
          }
        }}
      >
        <label className="field">
          <span>Invite code or link</span>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABC123"
            maxLength={200}
            autoFocus
            style={{ letterSpacing: "0.24em", fontSize: 18 }}
          />
        </label>
        <p className="hint">The host can see the code and link in their lobby. You can join until betting starts.</p>
        <button className="btn primary" disabled={codeFrom(code).length < 4}>
          Join series
        </button>
      </form>
    </Modal>
  );
}

/** Who's signed in, and the way out. */
function Account() {
  const { me, meUser, signOut } = useStore();
  const { theme, choose } = useTheme();
  const credits = useCredits().data?.credits ?? 0;
  return (
    <div className="whoami">
      <span className="cap">Signed in as</span>
      <Link to="/profile" className="who whoami-link" title="Edit your profile">
        <Avatar id={me} />
        <span style={{ minWidth: 0 }}>
          <b className="bright">{meUser.name}</b>
          <span className="dim" style={{ display: "block", fontSize: 12 }}>
            Edit profile{credits > 0 ? ` · ${credits.toLocaleString("en-US")} credits` : ""}
          </span>
        </span>
      </Link>
      <div className="row">
        <button type="button" className="btn ghost sm" onClick={() => choose(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <button type="button" className="btn ghost sm" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function Sidebar({ current, clanNav }: { current?: Series; clanNav?: { id: string; name: string } }) {
  const openBets = current?.bets.filter((b) => b.status === "open").length ?? 0;
  return (
    <aside className="sidebar">
      <Link to="/" className="brand" aria-label="Alea home">
        <span className="brand-mark">B</span>
        <span className="brand-name">Alea</span>
      </Link>
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/series">All series</NavLink>
        {current && (
          <div className="series-nav">
            <NavLink to={`/s/${current.id}`} end className="series-nav-title" title={current.name}>
              <span className="truncate">{current.name}</span>{openBets > 0 && <b>{openBets}</b>}
            </NavLink>
            {current.status !== "lobby" && <NavLink to={`/s/${current.id}/leaderboard`}>Leaderboard</NavLink>}
            {current.status !== "lobby" && <NavLink to={`/s/${current.id}/rules`}>Rules &amp; players</NavLink>}
          </div>
        )}
        <NavLink to="/new">New series</NavLink>
        <NavLink to="/friends">Friends</NavLink>
        <NavLink to="/clans">Clans</NavLink>
        {clanNav && <details className="series-nav clan-nav" open key={clanNav.id}>
          <summary title={clanNav.name}>{clanNav.name}</summary>
          <NavLink to={`/clans/${clanNav.id}`} end>Overview</NavLink>
          <NavLink to={`/clans/${clanNav.id}/chat`}>Chat</NavLink>
        </details>}
        <NavLink to="/tutorial">Tutorial</NavLink>
        <NavLink to="/profile">Profile</NavLink>
      </nav>
      <div className="grow" />
      <Account />
    </aside>
  );
}

export type Crumb = { label: string; to?: string };

function TopBar({ crumbs, current }: { crumbs: Crumb[]; current?: Series }) {
  const { me } = useStore();
  let status: ReactNode = null;
  if (current && current.status !== "lobby" && isParticipant(current, me)) {
    const b = balances(current).get(me)!;
    const st = standings(current).find((r) => r.userId === me)!;
    status = (
      <span className="op">
        <b className="num">{fmt(b.available)}</b> coins free · <b>{ordinal(st.rank)}</b> of {participantIds(current).length}
      </span>
    );
  }
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            <span className="sep">/</span>
            {c.to ? <Link to={c.to}>{c.label}</Link> : <span className="here">{c.label}</span>}
          </Fragment>
        ))}
      </nav>
      <div className="spacer" />
      {status}
    </header>
  );
}

/**
 * Keep --vvh / --vvt set to the visible part of the window. On phones the
 * on-screen keyboard shrinks it, so a full-height screen sized with these keeps
 * its bottom (the chat composer) above the keyboard.
 */
function useVisualViewport(on: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv) return;
    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--vvh", `${vv.height}px`);
      root.style.setProperty("--vvt", `${vv.offsetTop}px`);
    };
    set();
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
    };
  }, [on]);
}

/** `fill`: the page is one full-height screen that scrolls inside itself (the chat), instead of the window scrolling. */
export function Shell({ crumbs = [], children, fill = false, clanNav }: { crumbs?: Crumb[]; children: ReactNode; fill?: boolean; clanNav?: { id: string; name: string } }) {
  const { db } = useStore();
  const m = useMatch("/s/:id/*");
  const current = m ? db.series.find((s) => s.id === m.params.id) : undefined;
  useVisualViewport(fill);
  return (
    <div className={`app ${fill ? "fill" : ""}`}>
      <Sidebar current={current} clanNav={clanNav} />
      <div className="main">
        <TopBar crumbs={crumbs} current={current} />
        <main className={`page ${fill ? "fill" : ""}`}>{children}</main>
      </div>
      <Toasts />
    </div>
  );
}
