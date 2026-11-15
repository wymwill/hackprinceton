import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { ShareCard } from "../components/ShareCard.tsx";
import { ConfirmButton, Empty, Panel, PersonAvatar } from "../components/ui.tsx";
import { groupLink, useSocial } from "../lib/social.tsx";
import { useStore } from "../lib/store.tsx";

/** Your groups, with creation and joining. */
export default function Clans() {
  const { toast } = useStore();
  const { data, error, createClan, joinClan } = useSocial();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const clan = await createClan(name);
      if (clan) {
        toast(`${clan.name} is ready. Share its code to fill it.`);
        nav(`/groups/${clan.id}`);
      }
    } finally { setBusy(false); }
  };
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const clan = await joinClan(code);
      if (clan) {
        toast(`You joined ${clan.name}.`);
        nav(`/groups/${clan.id}`);
      }
    } finally { setBusy(false); }
  };

  return (
    <Shell crumbs={[{ label: "Groups" }]}>
      <div className="social">
        <section className="hero"><div><h1>Groups</h1><p>Keep your friends together, chat, and start a series with everyone.</p></div></section>
        {!data ? <Panel><Empty title={error ? "Couldn't load groups" : "Loading…"}>{error}</Empty></Panel> : (
          <>
            <Panel label="Your groups" right={`${data.clans.length} joined`}>
              {data.clans.length ? (
                <div className="clan-grid">
                  {data.clans.map((clan) => (
                    <Link key={clan.id} className="panel clan-card" to={`/groups/${clan.id}`}>
                      <span className="cap">Your group</span>
                      <b>{clan.name}</b>
                      <span className="dim">{clan.members.length} member{clan.members.length === 1 ? "" : "s"} · Private chat and series</span>
                      <span className="red-t">Open group →</span>
                    </Link>
                  ))}
                </div>
              ) : <Empty title="No groups yet">Start one or join with a code.</Empty>}
            </Panel>
            <div className="grid2">
              <Panel label="Start a group">
                <form className="row" onSubmit={create}>
                  <input className="input text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Group name" aria-label="Group name" />
                  <button className="btn primary" disabled={busy || !name.trim()}>Start</button>
                </form>
              </Panel>
              <Panel label="Join a group">
                <form className="row" onSubmit={join}>
                  <input className="input text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="Group code" autoCapitalize="characters" autoComplete="off" aria-label="Group code" />
                  <button className="btn" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 8}>Join</button>
                </form>
              </Panel>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

/** One group's members, invite, and actions. */
export function ClanDetail() {
  const { clanId = "" } = useParams();
  const { me } = useStore();
  const { data, error, leaveClan } = useSocial();
  const nav = useNavigate();
  const clan = data?.clans.find((c) => c.id === clanId);
  return (
    <Shell crumbs={[{ label: "Groups", to: "/groups" }, { label: clan?.name ?? "Group" }]} clanNav={clan ? { id: clan.id, name: clan.name } : undefined}>
      {!data ? <Panel><Empty title={error ? "Couldn't load group" : "Loading…"}>{error}</Empty></Panel> : !clan ? (
        <Panel><Empty title="Group not found">You may have left it. <Link to="/groups" className="red-t">See your groups</Link></Empty></Panel>
      ) : <div className="social">
        <section className="hero"><div><h1>{clan.name}</h1><p>{clan.members.length} member{clan.members.length === 1 ? "" : "s"} · Your place to chat and start a series together.</p></div></section>
        <div className="grid2">
          <Panel label="Members">
            <ul className="people">
              {[...clan.members].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <li key={m.id}>
                <span className="who"><PersonAvatar name={m.name} url={m.avatarUrl} me={m.id === me} /><span>{m.name}{m.id === me && <span className="dim"> (you)</span>}{m.id === clan.ownerId && <span className="pill host" style={{ marginLeft: 8 }}>Owner</span>}</span></span>
              </li>)}
            </ul>
            <div className="row end" style={{ marginTop: 18 }}>
              <ConfirmButton className="btn ghost sm" label="Leave group" confirm={clan.members.length === 1 ? "Leave and close it?" : "Leave?"} onConfirm={async () => { if (await leaveClan(clan.id)) nav("/groups"); }} />
            </div>
          </Panel>
          <div className="col">
            <ShareCard label="Invite to your group" code={clan.code} link={groupLink(clan.code)} shareTitle={`Join ${clan.name} on Bookie`} shareText={`Join my group ${clan.name} on Bookie: code ${clan.code}.`} hint="Friends scan this or open the link to join." />
            <Panel label="Bet together">
              <p className="hint">
                Start a Bet Series with everyone in {clan.name}. The name, description and rules are filled in, and all{" "}
                {clan.members.length} member{clan.members.length === 1 ? "" : "s"} start in the lobby.
              </p>
              <Link className="btn primary" to={`/new?group=${encodeURIComponent(clan.id)}`}>Start a series with this group →</Link>
            </Panel>
            <Panel label="Group chat"><p className="hint">Talk with everyone in this group.</p><Link className="btn primary" to={`/groups/${clan.id}/chat`}>Open chat →</Link></Panel>
          </div>
        </div>
      </div>}
    </Shell>
  );
}

/** /group/CODE (and older /clan/CODE links): join a group invite. */
export function JoinClanLink() {
  const { code = "" } = useParams();
  const { toast } = useStore();
  const { joinClan } = useSocial();
  const nav = useNavigate();
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    joinClan(code).then((clan) => {
      if (clan) { toast(`You joined ${clan.name}.`); nav(`/groups/${clan.id}`, { replace: true }); }
      else setFailed(true);
    });
  }, [joinClan, code, nav, toast]);
  return <Shell crumbs={[{ label: "Groups", to: "/groups" }, { label: "Join" }]}><Panel>
    {failed ? <Empty title="Couldn't join that group"><Link to="/groups" className="red-t">Go to Groups</Link></Empty> : <Empty title="Joining the group…" />}
  </Panel></Shell>;
}
