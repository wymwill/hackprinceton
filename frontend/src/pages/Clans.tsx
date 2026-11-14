import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { ShareCard } from "../components/ShareCard.tsx";
import { ConfirmButton, Empty, Panel, PersonAvatar } from "../components/ui.tsx";
import { fmt } from "../lib/format.ts";
import { clanLink, useSocial } from "../lib/social.tsx";
import { useStore } from "../lib/store.tsx";
import { ClanTabs } from "./ClanChat.tsx";
import type { ClanRow } from "../lib/types.ts";

/** Your clan, starting or joining one, and every clan ranked by coins wagered. */
export default function Clans() {
  const { me, toast } = useStore();
  const { data, error, createClan, joinClan, leaveClan } = useSocial();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const c = await createClan(name);
    if (c) toast(`${c.name} is ready. Share its code to fill it.`);
    setBusy(false);
  };
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const c = await joinClan(code);
    if (c) toast(`You joined ${c.name}.`);
    setBusy(false);
  };

  const clan = data?.clan;
  const total = clan?.members.reduce((n, m) => n + m.wagered, 0) ?? 0;
  const myRank = data?.clanBoard.find((r) => r.mine)?.rank;

  return (
    <Shell crumbs={[{ label: "Clans" }]}>
      <div className="social">
        <section className="hero">
          <div>
            <h1>Clans</h1>
            <p>Team up and climb the board. Every coin your members wager counts.</p>
          </div>
        </section>

        {data?.clan && <ClanTabs />}

        {!data ? (
          <Panel>
            <Empty title={error ? "Couldn't load clans" : "Loading…"}>{error}</Empty>
          </Panel>
        ) : (
          <>
            <div className="grid2">
              <div className="col">
                {clan ? (
                  <Panel label={clan.name} right={myRank ? `#${myRank} · ${fmt(total)} wagered` : `${fmt(total)} wagered`}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Member</th>
                          <th className="r">Wagered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clan.members.map((m, i) => (
                          <tr key={m.id} className={m.id === me ? "me" : ""}>
                            <td className="rank">{i + 1}</td>
                            <td>
                              <span className="who">
                                <PersonAvatar name={m.name} url={m.avatarUrl} me={m.id === me} />
                                <span>
                                  {m.name}
                                  {m.id === me && <span className="dim"> (you)</span>}
                                  {m.id === clan.ownerId && <span className="pill host" style={{ marginLeft: 8 }}>Owner</span>}
                                </span>
                              </span>
                            </td>
                            <td className="r num bright">{fmt(m.wagered)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="row end" style={{ marginTop: 18 }}>
                      <ConfirmButton
                        className="btn ghost sm"
                        label="Leave clan"
                        confirm={clan.members.length === 1 ? "Leave and close it?" : "Leave?"}
                        onConfirm={leaveClan}
                      />
                    </div>
                  </Panel>
                ) : (
                  <>
                    <Panel label="Start a clan">
                      <form className="row" onSubmit={create}>
                        <input className="input text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Clan name" aria-label="Clan name" />
                        <button className="btn primary" disabled={busy || !name.trim()}>
                          Start
                        </button>
                      </form>
                    </Panel>
                    <Panel label="Join a clan">
                      <form className="row" onSubmit={join}>
                        <input
                          className="input text"
                          value={code}
                          onChange={(e) => setCode(e.target.value.toUpperCase())}
                          maxLength={12}
                          placeholder="Clan code"
                          autoCapitalize="characters"
                          autoComplete="off"
                          aria-label="Clan code"
                        />
                        <button className="btn" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 8}>
                          Join
                        </button>
                      </form>
                    </Panel>
                  </>
                )}
              </div>

              <div className="col">
                {clan ? (
                  <ShareCard
                    label="Invite to your clan"
                    code={clan.code}
                    link={clanLink(clan.code)}
                    shareTitle={`Join ${clan.name} on Alea`}
                    shareText={`Join my clan ${clan.name} on Alea: code ${clan.code}.`}
                    hint="Friends scan this or open the link to join."
                  />
                ) : (
                  <Panel label="How clans work">
                    <ul className="facts">
                      <li>You can be in one clan at a time.</li>
                      <li>Clans rank by coins their members wager, win or lose.</li>
                      <li>Cancelled bets don't count.</li>
                    </ul>
                  </Panel>
                )}
              </div>
            </div>

            <Panel label="Clan leaderboard">
              {data.clanBoard.length === 0 ? <Empty title="No clans yet">Start the first one.</Empty> : <Board rows={data.clanBoard} />}
            </Panel>
          </>
        )}
      </div>
    </Shell>
  );
}

function Board({ rows }: { rows: ClanRow[] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Clan</th>
          <th className="r">Members</th>
          <th className="r">Wagered</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.mine ? "me" : ""}>
            <td className="rank">{r.rank}</td>
            <td className="bright">
              {r.name}
              {r.mine && <span className="dim"> (yours)</span>}
            </td>
            <td className="r num">{r.members}</td>
            <td className="r num bright">{fmt(r.wagered)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** /clan/CODE: a clan invite link or QR code. Signing in happens first, then this joins. */
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
    joinClan(code).then((c) => {
      if (c) {
        toast(`You joined ${c.name}.`);
        nav("/clans", { replace: true });
      } else setFailed(true);
    });
  }, [joinClan, code, nav, toast]);

  return (
    <Shell crumbs={[{ label: "Clans", to: "/clans" }, { label: "Join" }]}>
      <Panel>
        {failed ? (
          <Empty title="Couldn't join that clan">
            You may already be in another clan.{" "}
            <Link to="/clans" className="red-t">
              Go to Clans
            </Link>
          </Empty>
        ) : (
          <Empty title="Joining the clan…" />
        )}
      </Panel>
    </Shell>
  );
}
