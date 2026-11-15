import { useMemo, useState } from "react";
import { DisclosurePanel } from "./ui.tsx";
import { ago } from "../lib/format.ts";
import { KINDS, kindLabel, measure, useProof } from "../lib/links.tsx";
import { participantIds } from "../lib/rules.ts";
import { useStore } from "../lib/store.tsx";
import type { Bet, Series } from "../lib/types.ts";

/**
 * Bet page: a player's public GitHub activity since the bet opened, so the
 * host can call bets from real data. Only as fresh as that player's last sync.
 */
export function LinkedProof({ s, bet }: { s: Series; bet: Bet }) {
  const { me, name } = useStore();
  const players = participantIds(s);
  const [who, setWho] = useState<string>(players.includes(me) ? me : (players[0] ?? ""));
  const app = "github";
  const [kind, setKind] = useState("");
  const since = bet.openedAt ?? s.startedAt ?? null;
  const { proof, error } = useProof(s.id, who || null, since, app, kind);

  // Totals per unit, so runs (m), sleep (min) and steps add up separately.
  const totals = useMemo(() => {
    const t = new Map<string, number>();
    for (const i of proof?.items ?? []) if (i.unit !== "score" && i.unit !== "%") t.set(i.unit, (t.get(i.unit) ?? 0) + Number(i.value));
    return [...t.entries()].filter(([, v]) => v > 0);
  }, [proof]);

  if (!players.length) return null;
  const items = proof?.items ?? [];
  const linked = proof?.linked ?? [];
  const freshness = linked.filter((l) => !app || l.provider === app);

  return (
    <DisclosurePanel label="GitHub activity" className="proof-panel">
      <div className="stack">
        <label className="field">
          <span>Player</span>
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            {players.map((id) => (
              <option key={id} value={id}>
                {name(id)}
                {id === me ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label className="field">
            <span>What</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Everything</option>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p className="notice">{error}</p>
        ) : !proof ? (
          <p className="hint">Loading…</p>
        ) : linked.length === 0 ? (
          <p className="hint">{who === me ? "Connect GitHub on your profile to show activity here." : `${name(who)} hasn't connected GitHub.`}</p>
        ) : app && !linked.some((l) => l.provider === app) ? (
          <p className="hint">
            {who === me ? "You haven't" : `${name(who)} hasn't`} linked {"GitHub"}.
          </p>
        ) : (
          <>
            <div className="proof-totals">
              <div>
                <b>{items.length}</b>
                <span className="cap">{items.length === 1 ? "item" : "items"}</span>
              </div>
              {totals.slice(0, 2).map(([unit, v]) => (
                <div key={unit}>
                  <b>{measure(v, unit)}</b>
                  <span className="cap">total</span>
                </div>
              ))}
            </div>
            {items.length > 0 && (
              <ul className="proof-list">
                {items.slice(0, 10).map((i) => (
                  <li key={`${i.provider}:${i.id}`}>
                    <span className="grow">
                      <span className="bright">{i.title || kindLabel(i.kind)}</span>
                      <span className="dim">
                        {" "}
                        · {"GitHub"}, {kindLabel(i.kind).toLowerCase()}
                      </span>
                    </span>
                    <span className="num dim">{measure(Number(i.value), i.unit)}</span>
                    <span className="num dim">{ago(i.startedAt)} ago</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">
              {since ? `Since this bet opened ${ago(since)} ago.` : "Everything synced."}{" "}
              {freshness.map((l) => `${"GitHub"} ${l.lastSyncedAt ? `synced ${ago(l.lastSyncedAt)} ago` : "not synced yet"}`).join(" · ")}
            </p>
          </>
        )}
      </div>
    </DisclosurePanel>
  );
}
