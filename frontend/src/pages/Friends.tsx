import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { ShareCard } from "../components/ShareCard.tsx";
import { ConfirmButton, Empty, Panel, PersonAvatar } from "../components/ui.tsx";
import { friendLink, useSocial } from "../lib/social.tsx";
import { useStore } from "../lib/store.tsx";

/** Your friend code (QR, share sheet, copy), adding friends by code, and your friends list. */
export default function Friends() {
  const { toast } = useStore();
  const { data, error, addFriend, removeFriend } = useSocial();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const f = await addFriend(code);
    if (f) {
      toast(`${f.name} is now your friend.`);
      setCode("");
    }
    setBusy(false);
  };

  return (
    <Shell crumbs={[{ label: "Friends" }]}>
      <div className="social">
        <section className="hero">
          <div>
            <h1>Friends</h1>
            <p>Scan each other's code in person, or send your link.</p>
          </div>
        </section>

        {!data ? (
          <Panel>
            <Empty title={error ? "Couldn't load your friends" : "Loading…"}>{error}</Empty>
          </Panel>
        ) : (
          <div className="grid2">
            <div className="col">
              <Panel label="Add a friend">
                <form className="row" onSubmit={add}>
                  <input
                    className="input text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Their code, like ABCD-2345"
                    maxLength={12}
                    autoCapitalize="characters"
                    autoComplete="off"
                    aria-label="Friend code"
                  />
                  <button className="btn primary" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 8}>
                    Add
                  </button>
                </form>
              </Panel>

              <Panel label={`Your friends (${data.friends.length})`}>
                {data.friends.length === 0 ? (
                  <Empty title="No friends yet">Show them your code, or share your link.</Empty>
                ) : (
                  <ul className="people">
                    {data.friends.map((f) => (
                      <li key={f.id}>
                        <PersonAvatar name={f.name} url={f.avatarUrl} />
                        <span className="grow bright">{f.name}</span>
                        <ConfirmButton className="btn ghost sm" label="Remove" confirm="Remove?" onConfirm={() => removeFriend(f.id)} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="col">
              <ShareCard
                label="Your code"
                code={data.me.friendCode}
                link={friendLink(data.me.friendCode)}
                shareTitle="Add me on Alea"
                shareText={`Add me on Alea: my friend code is ${data.me.friendCode}.`}
                hint="Friends scan this with their phone camera, or open your link."
              />
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

/** /add/CODE: a friend's link or QR code. Signing in happens first, then this adds them. */
export function AddFriendLink() {
  const { code = "" } = useParams();
  const { toast } = useStore();
  const { addFriend } = useSocial();
  const nav = useNavigate();
  const [failed, setFailed] = useState(false);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    addFriend(code).then((f) => {
      if (f) {
        toast(`${f.name} is now your friend.`);
        nav("/friends", { replace: true });
      } else setFailed(true);
    });
  }, [addFriend, code, nav, toast]);

  return (
    <Shell crumbs={[{ label: "Friends", to: "/friends" }, { label: "Add" }]}>
      <Panel>
        {failed ? (
          <Empty title="Couldn't add that friend">
            <Link to="/friends" className="red-t">
              Go to Friends
            </Link>
          </Empty>
        ) : (
          <Empty title="Adding your friend…" />
        )}
      </Panel>
    </Shell>
  );
}
