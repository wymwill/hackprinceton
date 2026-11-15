import { useState } from "react";
import { ConfirmButton, Panel } from "./ui.tsx";
import { ago } from "../lib/format.ts";
import { BLURB, useLinks } from "../lib/links.tsx";

/** Profile: connect public GitHub activity as proof for bets. */
export function LinkedAccounts() {
  const { providers, linked, busy, error, setupNeeded, linkGithub, sync, unlink } = useLinks();
  const [username, setUsername] = useState("");

  return (
    <Panel label="GitHub">
      {!providers ? (
        <p className="hint">{error ?? "Loading…"}</p>
      ) : (
        <div className="stack">
          <p className="hint">Connect a public GitHub username to show pushes and merged pull requests as proof. No GitHub sign-in is required; account ownership is not verified.</p>
          {setupNeeded && <p className="notice">GitHub connections are not enabled for this database yet.</p>}
          <ul className="links">
            {providers.map((p) => {
              const l = linked.find((x) => x.provider === p.id);
              return (
                <li key={p.id} className={`link-row ${p.id}`}>
                  <div className="grow">
                    <b className="bright">{p.label}</b>
                    <span className="hint">
                      {l
                        ? `${l.displayName ? `${l.displayName} · ` : ""}${l.items} ${l.items === 1 ? "item" : "items"}${l.lastSyncedAt ? ` · synced ${ago(l.lastSyncedAt)} ago` : ""}`
                        : p.configured
                          ? BLURB[p.id]
                          : "Not set up yet"}
                    </span>
                  </div>
                  {l ? (
                    <div className="row">
                      {p.configured && (
                        <button type="button" className="btn sm" onClick={() => sync(p.id)} disabled={!!busy}>
                          {busy === p.id ? "Syncing…" : "Sync"}
                        </button>
                      )}
                      <ConfirmButton className="btn ghost sm" label="Disconnect" confirm="Disconnect?" onConfirm={() => unlink(p.id)} disabled={!!busy} />
                    </div>
                  ) : (
                    <GithubForm value={username} onChange={setUsername} busy={busy === p.id} disabled={!!setupNeeded || !!busy} onLink={() => linkGithub(username)} />
                  )}

                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function GithubForm({ value, onChange, busy, disabled, onLink }: { value: string; onChange: (v: string) => void; busy: boolean; disabled: boolean; onLink: () => void }) {
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        onLink();
      }}
    >
      <input className="input text sm" value={value} onChange={(e) => onChange(e.target.value)} placeholder="username" maxLength={39} aria-label="GitHub username" autoCapitalize="off" autoComplete="off" />
      <button className="btn sm" disabled={busy || disabled || !value.trim()}>
        {busy ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
