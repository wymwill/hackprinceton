import { useState } from "react";
import { ConfirmButton, Panel } from "./ui.tsx";
import { ago } from "../lib/format.ts";
import { BLURB, useLinks, type ProviderInfo } from "../lib/links.tsx";

/** Profile: connect Strava, Fitbit, Oura, Whoop, Spotify and GitHub as proof for bets. */
export function LinkedAccounts() {
  const { providers, linked, busy, error, setupNeeded, connect, linkGithub, sync, unlink } = useLinks();
  const [username, setUsername] = useState("");

  return (
    <Panel label="Integrations">
      {!providers ? (
        <p className="hint">{error ?? "Loading…"}</p>
      ) : (
        <div className="stack">
          <p className="hint">Friends in your series can use these as proof on bets. Alea only reads, and disconnecting deletes everything it copied.</p>
          {setupNeeded && <p className="notice">Integrations aren't switched on for this database yet, so connecting is turned off for now.</p>}
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
                  ) : p.method === "username" ? (
                    <GithubForm value={username} onChange={setUsername} busy={busy === p.id} disabled={!!setupNeeded} onLink={() => linkGithub(username)} />
                  ) : (
                    <button type="button" className="btn sm" onClick={() => connect(p as ProviderInfo)} disabled={!p.configured || !!busy || !!setupNeeded}>
                      Connect
                    </button>
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
