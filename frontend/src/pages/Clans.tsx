import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { ShareCard } from "../components/ShareCard.tsx";
import { ConfirmButton, Empty, Panel, PersonAvatar } from "../components/ui.tsx";
import { fmt } from "../lib/format.ts";
import { clanLink, useSocial } from "../lib/social.tsx";
import { useStore } from "../lib/store.tsx";
import type { ClanRow } from "../lib/types.ts";

/** All of your clans, with creation, joining, and the public clan board. */
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
        nav(`/clans/${clan.id}`);
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
        nav(`/clans/${clan.id}`);
      }
    } finally { setBusy(false); }
  };

  return (
    <Shell crumbs={[{ label: "Clans" }]}>
      <div className="social">
        <section className="hero"><div><h1>Clans</h1><p>Every coin your clan members wager helps them climb the board.</p></div></section>
        {!data ? <Panel><Empty title={error ? "Couldn't load clans" : "Loading…"}>{error}</Empty></Panel> : (
          <>
            <Panel label="Your clans" right={`${data.clans.length} joined`}>
              {data.clans.length ? (
                <div className="clan-grid">
                  {data.clans.map((clan) => {
                    const rank = data.clanBoard.find((r) => r.id === clan.id)?.rank;
                    const total = clan.members.reduce((n, m) => n + m.wagered, 0);
                    return <Link key={clan.id} className="panel clan-card" to={`/clans/${clan.id}`}>
                      <span className="cap">{rank ? `#${rank} on the board` : "Your clan"}</span>
                      <b>{clan.name}</b>
                      <span className="dim">{clan.members.length} member{clan.members.length === 1 ? "" : "s"} · {fmt(total)} wagered</span>
                      <span className="red-t">Open clan →</span>
                    </Link>;
                  })}
                </div>
              ) : <Empty title="No clans yet">Start one or join with a code.</Empty>}
            </Panel>
            <div className="grid2">
              <Panel label="Start a clan">
                <form className="row" onSubmit={create}>
                  <input className="input text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Clan name" aria-label="Clan name" />
                  <button className="btn primary" disabled={busy || !name.trim()}>Start</button>
                </form>
              </Panel>
              <Panel label="Join a clan">
                <form className="row" onSubmit={join}>
                  <input className="input text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="Clan code" autoCapitalize="characters" autoComplete="off" aria-label="Clan code" />
                  <button className="btn" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 8}>Join</button>
                </form>
              </Panel>
            </div>
            <Panel label="Clan leaderboard">
              {data.clanBoard.length ? <Board rows={data.clanBoard} /> : <Empty title="No clans yet">Start the first one.</Empty>}
            </Panel>
          </>
        )}
      </div>
    </Shell>
  );
}

/** One clan's members, invite, and actions. */
export function ClanDetail() {
  const { clanId = "" } = useParams();
  const { me } = useStore();
  const { data, error, leaveClan } = useSocial();
  const nav = useNavigate();
  const clan = data?.clans.find((c) => c.id === clanId);
  const rank = data?.clanBoard.find((r) => r.id === clanId)?.rank;
  const total = clan?.members.reduce((n, m) => n + m.wagered, 0) ?? 0;
  return (
    <Shell crumbs={[{ label: "Clans", to: "/clans" }, { label: clan?.name ?? "Clan" }]} clanNav={clan ? { id: clan.id, name: clan.name } : undefined}>
      {!data ? <Panel><Empty title={error ? "Couldn't load clan" : "Loading…"}>{error}</Empty></Panel> : !clan ? (
        <Panel><Empty title="Clan not found">You may have left it. <Link to="/clans" className="red-t">See your clans</Link></Empty></Panel>
      ) : <div className="social">
        <section className="hero"><div><h1>{clan.name}</h1><p>{rank ? `#${rank} on the clan board · ` : ""}{fmt(total)} coins wagered</p></div></section>
        <div className="grid2">
          <Panel label="Members" right={`${clan.members.length}`}>
            <table className="table"><thead><tr><th>#</th><th>Member</th><th className="r">Wagered</th></tr></thead><tbody>
              {clan.members.map((m, i) => <tr key={m.id} className={m.id === me ? "me" : ""}>
                <td className="rank">{i + 1}</td><td><span className="who"><PersonAvatar name={m.name} url={m.avatarUrl} me={m.id === me} /><span>{m.name}{m.id === me && <span className="dim"> (you)</span>}{m.id === clan.ownerId && <span className="pill host" style={{ marginLeft: 8 }}>Owner</span>}</span></span></td>
                <td className="r num bright">{fmt(m.wagered)}</td>
              </tr>)}
            </tbody></table>
            <div className="row end" style={{ marginTop: 18 }}>
              <ConfirmButton className="btn ghost sm" label="Leave clan" confirm={clan.members.length === 1 ? "Leave and close it?" : "Leave?"} onConfirm={async () => { if (await leaveClan(clan.id)) nav("/clans"); }} />
            </div>
          </Panel>
          <div className="col">
            <ShareCard label="Invite to your clan" code={clan.code} link={clanLink(clan.code)} shareTitle={`Join ${clan.name} on Alea`} shareText={`Join my clan ${clan.name} on Alea: code ${clan.code}.`} hint="Friends scan this or open the link to join." />
            <Panel label="Bet together">
              <p className="hint">
                Start a Bet Series with everyone in {clan.name}. The name, description and rules are filled in, and all{" "}
                {clan.members.length} member{clan.members.length === 1 ? "" : "s"} start in the lobby.
              </p>
              <Link className="btn primary" to={`/new?clan=${encodeURIComponent(clan.id)}`}>Start a series with this clan →</Link>
            </Panel>
            <Panel label="Clan chat"><p className="hint">Talk with the members of this clan.</p><Link className="btn primary" to={`/clans/${clan.id}/chat`}>Open chat →</Link></Panel>
          </div>
        </div>
      </div>}
    </Shell>
  );
}

function Board({ rows }: { rows: ClanRow[] }) {
  return <table className="table"><thead><tr><th>#</th><th>Clan</th><th className="r">Members</th><th className="r">Wagered</th></tr></thead><tbody>
    {rows.map((r) => <tr key={r.id} className={r.mine ? "me" : ""}>
      <td className="rank">{r.rank}</td><td className="bright">{r.mine ? <Link to={`/clans/${r.id}`}>{r.name} <span className="dim">(yours)</span></Link> : r.name}</td>
      <td className="r num">{r.members}</td><td className="r num bright">{fmt(r.wagered)}</td>
    </tr>)}
  </tbody></table>;
}

/** /clan/CODE: joining an invite opens the selected clan. */
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
      if (clan) { toast(`You joined ${clan.name}.`); nav(`/clans/${clan.id}`, { replace: true }); }
      else setFailed(true);
    });
  }, [joinClan, code, nav, toast]);
  return <Shell crumbs={[{ label: "Clans", to: "/clans" }, { label: "Join" }]}><Panel>
    {failed ? <Empty title="Couldn't join that clan"><Link to="/clans" className="red-t">Go to Clans</Link></Empty> : <Empty title="Joining the clan…" />}
  </Panel></Shell>;
}
