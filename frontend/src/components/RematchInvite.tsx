import { useSearchParams } from "react-router-dom";
import { rematchInvitees } from "../lib/recap.ts";
import { useStore } from "../lib/store.tsx";
import type { Series } from "../lib/types.ts";
import { ShareCard } from "./ShareCard.tsx";
import { Panel, PersonAvatar } from "./ui.tsx";

/**
 * In a rematch's lobby (?rematchOf=ID): last time's players, whether each has joined
 * yet, and the usual invite link and QR code. Nobody is added for them; they join
 * the way anyone does.
 */
export function RematchInvite({ s }: { s: Series }) {
  const { db, me } = useStore();
  const [params] = useSearchParams();
  const from = db.series.find((x) => x.id === params.get("rematchOf"));
  if (!from || s.hostId !== me || s.status !== "lobby") return null;
  const people = rematchInvitees(from, me);
  const joined = new Set(s.members.map((m) => m.userId));
  const waiting = people.filter((p) => !joined.has(p.userId)).length;
  const link = `${window.location.origin}/join/${s.code}`;
  return (
    <div className="grid2">
      <Panel label={`Invite the ${from.name} group`} right={waiting ? `${waiting} not joined yet` : "Everyone's in"}>
        <div className="people">
          {people.map((p) => (
            <div key={p.userId} className="person">
              <span className="who">
                <PersonAvatar name={p.name} url={p.avatarUrl} />
                <span>{p.name}</span>
              </span>
              {joined.has(p.userId) ? <span className="pill open">Joined</span> : <span className="pill draft">Not yet</span>}
            </div>
          ))}
          {people.length === 0 && <p className="hint">You were the only one last time. Share the link with anyone.</p>}
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Nobody is added automatically: each player joins with the link or code, and can say no.
        </p>
      </Panel>
      <ShareCard
        label="Rematch invite"
        code={s.code}
        link={link}
        shareTitle={`Rematch: ${s.name}`}
        shareText={`Rematch time. Join ${s.name} on Bookie with code ${s.code}.`}
        hint="Send this to last time's players, or let them scan it."
      />
    </div>
  );
}
