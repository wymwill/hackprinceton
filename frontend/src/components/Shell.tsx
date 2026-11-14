import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useMatch, useNavigate } from "react-router-dom";
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
  return (
    <aside className="sidebar">
      <Link to="/" className="brand" aria-label="Alea home">
        <span className="brand-mark">B</span>
        <span className="brand-name">Alea</span>
      </Link>
      <SeriesSwitcher current={current} />
      {current ? (
        <nav className="nav" aria-label="Series">
          <span className="cap">This series</span>
          <NavLink to={`/s/${current.id}`} end>
            {current.status === "lobby" ? "Lobby" : current.status === "active" ? "Dashboard" : "Results"}
            {openBets > 0 && <b>{openBets}</b>}
          </NavLink>
          {current.status !== "lobby" && <NavLink to={`/s/${current.id}/leaderboard`}>Leaderboard</NavLink>}
          <NavLink to={`/s/${current.id}/rules`}>Rules &amp; players</NavLink>
          {current.hostId === me && current.status === "active" && <span className="cap" style={{ padding: "10px 4px 0" }}>You're the host</span>}
          <span className="cap" style={{ padding: "14px 4px 0" }}>You</span>
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
      <Toasts />
    </div>
  );
}
