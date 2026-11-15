import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useMatch, useNavigate } from "react-router-dom";
import { balances, isParticipant, participantIds, standings } from "../lib/rules.ts";
import { STATUS_LABEL, fmt, ordinal } from "../lib/format.ts";
import { useStore } from "../lib/store.tsx";
import { useTheme } from "../lib/theme.ts";
import { useChatUnread } from "../lib/chat.ts";
import type { Db, Series } from "../lib/types.ts";
import { Avatar, Modal, Toasts } from "./ui.tsx";

/** Series this person is in (the server only sends those). */
export const mySeries = (db: Db) => db.series;

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

function SeriesSwitcher({ current }: { current?: Series }) {
  const { db } = useStore();
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = mySeries(db);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="switcher" ref={ref}>
      <button type="button" className="switcher-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span style={{ minWidth: 0 }}>
          <span className="cap">{current ? STATUS_LABEL[current.status] : "Bet Series"}</span>
          <b>{current ? current.name : "Pick a series"}</b>
        </span>
        <span className="dim" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="switcher-menu" role="menu">
          {list.length === 0 && <div className="empty">You're not in any series yet.</div>}
          {list.map((s) => (
            <Link key={s.id} to={`/s/${s.id}`} className={s.id === current?.id ? "on" : ""} onClick={() => setOpen(false)}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <span className="cap" style={{ fontSize: 9.5 }}>
                {STATUS_LABEL[s.status]}
              </span>
            </Link>
          ))}
          <div className="sep" />
          <Link to="/new" onClick={() => setOpen(false)}>
            + New series
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setJoining(true);
            }}
          >
            Join with a code
          </button>
          <Link to="/" onClick={() => setOpen(false)}>
            All series
          </Link>
        </div>
      )}
      {joining && <JoinModal onClose={() => setJoining(false)} />}
    </div>
  );
}

/** Who's signed in, and the way out. */
function Account() {
  const { me, meUser, signOut } = useStore();
  const { theme, choose } = useTheme();
  return (
    <div className="whoami">
      <span className="cap">Signed in as</span>
      <Link to="/profile" className="who whoami-link" title="Edit your profile">
        <Avatar id={me} />
        <span style={{ minWidth: 0 }}>
          <b className="bright">{meUser.name}</b>
          <span className="dim" style={{ display: "block", fontSize: 12 }}>
            Edit profile
          </span>
        </span>
      </Link>
      <div className="row">
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => choose(theme === "light" ? "dark" : "light")}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <button type="button" className="btn ghost sm" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}

/** "Clans", with a count of unread clan chat messages. */
function ClansLink() {
  const unread = useChatUnread();
  return (
    <NavLink to="/clans">
      Clans
      {unread > 0 && <b aria-label={`${unread} unread messages`}>{unread > 99 ? "99+" : unread}</b>}
    </NavLink>
  );
}

function Sidebar({ current }: { current?: Series }) {
  const { me } = useStore();
  const openBets = current?.bets.filter((b) => b.status === "open").length ?? 0;
  // On phones the nav and account fold away behind a Menu button; the bottom tabs cover the usual moves.
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);
  return (
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <Link to="/" className="brand" aria-label="Alea home">
        <span className="brand-mark">A</span>
        <span className="brand-name">Alea</span>
      </Link>
      <SeriesSwitcher current={current} />
      <button
        type="button"
        className="menu-btn"
        aria-expanded={menuOpen}
        aria-controls="side-more"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        onClick={() => setMenuOpen((o) => !o)}
      >
        {menuOpen ? <Icon name="close" /> : <Icon name="menu" />}
      </button>
      <div className="side-more" id="side-more">
        {current ? (
          <nav className="nav" aria-label="Series">
            <span className="cap">This series</span>
            <NavLink to={`/s/${current.id}`} end>
              {current.status === "lobby" ? "Lobby" : current.status === "active" ? "Dashboard" : "Results"}
              {openBets > 0 && <b>{openBets}</b>}
            </NavLink>
            {current.status !== "lobby" && <NavLink to={`/s/${current.id}/leaderboard`}>Leaderboard</NavLink>}
            <NavLink to={`/s/${current.id}/rules`}>Rules &amp; players</NavLink>
            {current.hostId === me && current.status === "active" && (
              <span className="cap" style={{ padding: "10px 4px 0" }}>
                You're the host
              </span>
            )}
            <span className="cap" style={{ padding: "14px 4px 0" }}>
              You
            </span>
            <NavLink to="/friends">Friends</NavLink>
            <ClansLink />
          </nav>
        ) : (
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end>
              All series
            </NavLink>
            <NavLink to="/new">New series</NavLink>
            <NavLink to="/friends">Friends</NavLink>
            <ClansLink />
            <NavLink to="/profile">Profile</NavLink>
          </nav>
        )}
        <div className="grow" />
        <Account />
      </div>
    </aside>
  );
}

const ICONS: Record<string, string> = {
  bets: "M4 5h16v4H4zM4 11h16v4H4zM4 17h10v2H4z",
  board: "M5 20V10h3v10zM10.5 20V4h3v16zM16 20v-7h3v7z",
  rules: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
  clans: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M12 15.5c1-.4 2.4-.5 4-.5 3 0 6 2 6 5",
  me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  home: "M3 11l9-7 9 7M6 9.5V20h12V9.5",
  plus: "M12 5v14M5 12h14",
  friends: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M18 8v6M15 11h6",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function Tab({ to, icon, label, end, badge }: { to: string; icon: keyof typeof ICONS; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink to={to} end={end}>
      <span className="tab-icon">
        <Icon name={icon} />
        {!!badge && <b aria-label={`${badge} new`}>{badge > 99 ? "99+" : badge}</b>}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

/** Phones only: the main places, one thumb away. */
function BottomTabs({ current }: { current?: Series }) {
  const unread = useChatUnread();
  const openBets = current?.bets.filter((b) => b.status === "open").length ?? 0;
  return (
    <nav className="bottom-tabs" aria-label="Quick">
      {current ? (
        <>
          <Tab
            to={`/s/${current.id}`}
            end
            icon="bets"
            label={current.status === "lobby" ? "Lobby" : current.status === "active" ? "Bets" : "Results"}
            badge={openBets}
          />
          {current.status !== "lobby" && <Tab to={`/s/${current.id}/leaderboard`} icon="board" label="Board" />}
          <Tab to={`/s/${current.id}/rules`} icon="rules" label="Rules" />
        </>
      ) : (
        <>
          <Tab to="/" end icon="home" label="Series" />
          <Tab to="/new" icon="plus" label="New" />
          <Tab to="/friends" icon="friends" label="Friends" />
        </>
      )}
      <Tab to="/clans" icon="clans" label="Clans" badge={unread} />
      <Tab to="/profile" icon="me" label="Me" />
    </nav>
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
        <Link to="/">Series</Link>
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
export function Shell({ crumbs = [], children, fill = false }: { crumbs?: Crumb[]; children: ReactNode; fill?: boolean }) {
  const { db } = useStore();
  const m = useMatch("/s/:id/*");
  const current = m ? db.series.find((s) => s.id === m.params.id) : undefined;
  useVisualViewport(fill);
  return (
    <div className={`app ${fill ? "fill" : ""}`}>
      <Sidebar current={current} />
      <div className="main">
        <TopBar crumbs={crumbs} current={current} />
        <main className={`page ${fill ? "fill" : ""}`}>{children}</main>
      </div>
      {!fill && <BottomTabs current={current} />}
      <Toasts />
    </div>
  );
}
