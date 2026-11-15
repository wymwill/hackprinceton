import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useMatch, useNavigate } from "react-router-dom";
import { balances, isParticipant, participantIds, standings } from "../lib/rules.ts";
import { fmt, ordinal } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import { useTheme } from "../lib/theme.ts";
import { useCredits } from "../lib/credits.ts";
import type { Series } from "../lib/types.ts";
import { Avatar, Modal, Toasts } from "./ui.tsx";
import { useReminders } from "../lib/reminders.ts";
import { useTour } from "./NavigationTour.tsx";

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
  const [joining, setJoining] = useState(false);
  // On phones the menu folds away behind a button and the bottom tabs cover the usual moves.
  // It stays open during the tour, which points at items in it.
  const [menuOpen, setMenuOpen] = useState(false);
  const { active: touring } = useTour();
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);
  const open = menuOpen || touring;
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <Link to="/" className="brand" aria-label="Bookie home">
        <span className="brand-mark">B</span>
        <span className="brand-name brand-letters" aria-hidden="true">{Array.from("ookie").map((letter, i) => <span key={i}>{letter}</span>)}</span>
      </Link>
      <button
        type="button"
        className="menu-btn"
        aria-expanded={open}
        aria-controls="side-more"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <Icon name={open ? "close" : "menu"} />
      </button>
      <div className="side-more" id="side-more">
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end data-tour="home">Home</NavLink>
        <NavLink to="/series">All series</NavLink>
        {current && (
          <div className="series-nav">
            <NavLink to={`/s/${current.id}`} end className="series-nav-title" title={current.name}>
              <span className="truncate">{current.name}</span>
            </NavLink>
            {current.status !== "lobby" && <NavLink to={`/s/${current.id}/leaderboard`}>Leaderboard</NavLink>}
            {current.status !== "lobby" && <NavLink to={`/s/${current.id}/rules`}>Rules &amp; players</NavLink>}
          </div>
        )}
        <NavLink to="/new" data-tour="new-series">New series</NavLink>
        <button type="button" data-tour="join" onClick={() => setJoining(true)}>Join with a code</button>
        <NavLink to="/friends" data-tour="friends">Friends</NavLink>
        <NavLink to="/groups" data-tour="groups">Groups</NavLink>
        {clanNav && <details className="series-nav clan-nav" open key={clanNav.id}>
          <summary title={clanNav.name}>{clanNav.name}</summary>
          <NavLink to={`/groups/${clanNav.id}`} end>Overview</NavLink>
          <NavLink to={`/groups/${clanNav.id}/chat`}>Chat</NavLink>
        </details>}
        <NavLink to="/profile" data-tour="profile">Profile</NavLink>
      </nav>
      {joining && <JoinModal onClose={() => setJoining(false)} />}
      <div className="grow" />
      <Account />
      </div>
    </aside>
  );
}

const ICONS = {
  home: "M3 11l9-7 9 7M6 9.5V20h12V9.5",
  series: "M4 5h16v4H4zM4 11h16v4H4zM4 17h10v2H4z",
  plus: "M12 5v14M5 12h14",
  groups: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M12 15.5c1-.4 2.4-.5 4-.5 3 0 6 2 6 5",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  board: "M5 20V10h3v10zM10.5 20V4h3v16zM16 20v-7h3v7z",
  rules: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Tab({ to, icon, label, end }: { to: string; icon: keyof typeof ICONS; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  );
}

/** Phones only: the main places, one thumb away. Inside a series, its own pages. */
function BottomTabs({ current }: { current?: Series }) {
  return (
    <nav className="bottom-tabs" aria-label="Quick">
      <Tab to="/" end icon="home" label="Home" />
      {current ? (
        <>
          <Tab to={`/s/${current.id}`} end icon="series" label={current.status === "lobby" ? "Lobby" : current.status === "active" ? "Bets" : "Results"} />
          {current.status !== "lobby" && <Tab to={`/s/${current.id}/leaderboard`} icon="board" label="Board" />}
          {current.status !== "lobby" && <Tab to={`/s/${current.id}/rules`} icon="rules" label="Rules" />}
        </>
      ) : (
        <>
          <Tab to="/series" icon="series" label="Series" />
          <Tab to="/new" icon="plus" label="New" />
          <Tab to="/groups" icon="groups" label="Groups" />
        </>
      )}
      <Tab to="/profile" icon="me" label="Me" />
    </nav>
  );
}

export type Crumb = { label: string; to?: string };

function TopBar({ crumbs, current }: { crumbs: Crumb[]; current?: Series }) {
  const { me } = useStore();
  const { start } = useTour();
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
      <button type="button" className="tour-help" data-tour="help" aria-label="Start navigation tutorial" title="Take a quick tour" onClick={start}>?</button>
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
  useReminders(true);
  return (
    <div className={`app ${fill ? "fill" : ""}`}>
      <Sidebar current={current} clanNav={clanNav} />
      <div className="main">
        <TopBar crumbs={crumbs} current={current} />
        <main className={`page ${fill ? "fill" : ""}`}>{children}</main>
      </div>
      {!fill && <BottomTabs current={current} />}
      <Toasts />
    </div>
  );
}
