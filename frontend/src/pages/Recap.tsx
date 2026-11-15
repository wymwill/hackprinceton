import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { StandingsTable } from "../components/Standings.tsx";
import { Empty, Panel, Who } from "../components/ui.tsx";
import { fmt, signed } from "../lib/format.ts";
import { posterLines } from "../lib/poster.ts";
import { BEST_CALL_RULE, UPSET_RULE, pct, recap, type Recap } from "../lib/recap.ts";
import { escapeSvg, sharePng, svgToPng } from "../lib/shareImage.ts";
import { useShare } from "../lib/social.tsx";
import { useStore } from "../lib/store.tsx";
import type { Id, Series } from "../lib/types.ts";

export const recapLink = (s: Series) => `${window.location.origin}/s/${s.id}/recap`;

/**
 * The share card: series name, final standings, biggest upset, best call. Portrait,
 * 1080×1350. Only what the recap shows to players; no punishments, clans or emails.
 */
export function recapSvg(s: Series, r: Recap, name: (id: Id) => string) {
  const W = 1080;
  const H = 1350;
  // One fill per element: a second fill attribute would make the SVG invalid, and the image would never load.
  const t = (x: number, y: number, size: number, text: string, opts = "", fill = "#fff") =>
    `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial,sans-serif" font-size="${size}" ${opts}>${escapeSvg(text)}</text>`;
  const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/><circle cx="930" cy="170" r="420" fill="url(#glow)"/>`);
  parts.push(t(80, 110, 30, "ALEA ✳ SERIES RECAP", `font-weight="700" letter-spacing="7"`));
  parts.push(t(80, 200, 64, clip(s.name, 26), `font-weight="800"`));

  // Standings: top five, then "and N more".
  parts.push(t(80, 290, 24, "FINAL STANDINGS", `opacity=".7" letter-spacing="5"`));
  r.standings.slice(0, 5).forEach((row, i) => {
    const y = 350 + i * 58;
    const gold = row.rank === 1;
    parts.push(t(80, y, 36, `${row.rank}.`, `font-weight="800"${gold ? "" : ` opacity=".75"`}`));
    parts.push(t(140, y, 36, clip(name(row.userId), 22), `font-weight="${gold ? 800 : 600}"`, gold ? "#ffd66b" : "#fff"));
    parts.push(t(1000, y, 34, `${fmt(row.coins)}`, `text-anchor="end" font-weight="700"`));
  });
  if (r.standings.length > 5) parts.push(t(140, 350 + 5 * 58, 26, `and ${r.standings.length - 5} more`, `opacity=".7"`));

  // Upset and best call, or why there are none.
  const block = (y: number, label: string, lines: string[], foot: string) => {
    parts.push(`<rect x="60" y="${y}" width="960" height="250" rx="34" fill="#fff" opacity=".1"/>`);
    parts.push(t(100, y + 60, 24, label, `opacity=".75" letter-spacing="5"`));
    lines.slice(0, 3).forEach((l, i) => parts.push(t(100, y + 112 + i * 44, 34, l, `font-weight="700"`)));
    parts.push(t(100, y + 220, 26, foot, "", "#ffd66b"));
  };
  const strip = (l: string[]) => l.map((x) => x.replace(/^“|”$/g, ""));
  if (r.upset) {
    block(700, "BIGGEST UPSET", strip(posterLines(r.upset.question, 2, 44)), `${r.upset.outcome} won with only ${pct(r.upset.share)} of the coins on it`);
  } else {
    block(700, "BIGGEST UPSET", ["No upsets: no bet was won against", "the crowd's money."], "");
  }
  if (r.bestCall) {
    const c = r.bestCall;
    block(980, "BEST CALL", [`${clip(name(c.userId), 24)} backed ${clip(c.outcome, 16)}`, ...strip(posterLines(c.question, 1, 44))], `${pct(c.share)} of the coins agreed · ${signed(c.payout - c.stake)} coins`);
  } else {
    block(980, "BEST CALL", ["No winning pick against the crowd", "this series."], "");
  }
  parts.push(t(80, 1300, 22, "Shares of coins when betting closed, not odds.", `opacity=".6"`));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#141327"/><stop offset=".55" stop-color="#3e2a66"/><stop offset="1" stop-color="#e8613f"/></linearGradient><radialGradient id="glow"><stop stop-color="#ffd66b" stop-opacity=".55"/><stop offset="1" stop-color="#ffd66b" stop-opacity="0"/></radialGradient></defs>${parts.join("")}</svg>`;
}

/** Biggest upset, best call, and the ways to share them. */
export function RecapPanel({ s }: { s: Series }) {
  const { name, toast } = useStore();
  const r = useMemo(() => recap(s), [s]);
  const { canShare, copy } = useShare();
  const [busy, setBusy] = useState(false);

  const exportCard = async (share: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await svgToPng(recapSvg(s, r, name), 1080, 1350);
      const how = await sharePng(blob, `alea-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "series"}-recap.png`, {
        share,
        title: `${s.name}: Bookie recap`,
        text: r.winnerId ? `${name(r.winnerId)} won ${s.name} on Bookie.` : `${s.name} on Bookie.`,
      });
      if (how === "downloaded") toast("Recap card downloaded.");
    } catch {
      toast("The card couldn't be made on this device. Try Download again.", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel label="Recap" right={`${r.settled} settled bet${r.settled === 1 ? "" : "s"}${r.voided ? ` · ${r.voided} refunded or canceled` : ""}`} className="recap">
      <div className="stack" style={{ gap: 16 }}>
        <div>
          <span className="cap">Biggest upset</span>
          {r.upset ? (
            <p className="recap-line">
              “<Link to={`/s/${s.id}/bets/${r.upset.betId}`} className="bright">
                {r.upset.question}
              </Link>”{" "}
              <b>{r.upset.outcome}</b> won with only <b>{pct(r.upset.share)}</b> of the {fmt(r.upset.pool)} coins on it.
              {r.upset.alsoAsSurprising > 0 && <span className="dim"> ({r.upset.alsoAsSurprising} more as surprising; the bigger pool is shown.)</span>}
            </p>
          ) : (
            <p className="hint">{r.settled ? "No bet was won against the crowd's money." : "No bets were settled, so there's no upset."}</p>
          )}
        </div>
        <div>
          <span className="cap">Best call</span>
          {r.bestCall ? (
            <p className="recap-line">
              <Who id={r.bestCall.userId} /> backed <b>{r.bestCall.outcome}</b> on{" "}
              “<Link to={`/s/${s.id}/bets/${r.bestCall.betId}`} className="bright">
                {r.bestCall.question}
              </Link>”{" "}
              when only <b>{pct(r.bestCall.share)}</b> of the coins agreed: {fmt(r.bestCall.stake)} in, {fmt(r.bestCall.payout)} back.
              {r.bestCall.sharedWith.length > 0 && <span className="dim"> Shared with {r.bestCall.sharedWith.map(name).join(", ")} (same call, same profit).</span>}
            </p>
          ) : (
            <p className="hint">{r.settled ? "Every winning pick was on the side most coins were on." : "No bets were settled, so there's no best call."}</p>
          )}
        </div>
        {r.winnerOnTiebreak && (
          <p className="hint">
            First place was tied on coins and decided by the tiebreak ({s.settings.tiebreak === "first" ? "first to reach the score" : "an order drawn at the start"}).
          </p>
        )}
        <details className="hint">
          <summary>How these are picked</summary>
          <p>{UPSET_RULE}</p>
          <p>{BEST_CALL_RULE}</p>
        </details>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn primary" onClick={() => exportCard(false)} disabled={busy} aria-busy={busy}>
            Download card
          </button>
          {canShare && (
            <button type="button" className="btn" onClick={() => exportCard(true)} disabled={busy}>
              Share card
            </button>
          )}
          <button type="button" className="btn" onClick={() => copy(recapLink(s))}>
            Copy recap link
          </button>
        </div>
        <p className="hint">The link opens this recap for players in the series. Anyone else sees nothing, so share the card for everyone else.</p>
      </div>
    </Panel>
  );
}

/** /s/:id/recap: the read-only recap. Players in the series only (the same rule as every series page). */
export default function SeriesRecap() {
  const { db } = useStore();
  const { id } = useParams();
  const s = db.series.find((x) => x.id === id);
  if (!s) {
    return (
      <Shell crumbs={[{ label: "Recap" }]}>
        <Panel>
          <Empty title="This recap isn't available to you">
            Recaps are only for players in the series. Ask one of them to share the recap card instead.{" "}
            <Link to="/" className="red-t">
              Go home
            </Link>
          </Empty>
        </Panel>
      </Shell>
    );
  }
  const over = s.status === "finished" || s.status === "assigning";
  return (
    <Shell crumbs={[{ label: s.name, to: `/s/${s.id}` }, { label: "Recap" }]}>
      <section className="hero">
        <div>
          <h1>
            {s.name} <em>recap</em>
          </h1>
          <p>{over ? "How it ended, and the moments worth bragging about." : "The recap appears when the series is over."}</p>
        </div>
      </section>
      {over && (
        <div className="grid2">
          <div className="col">
            <Panel label="Final standings">
              <StandingsTable s={s} />
            </Panel>
          </div>
          <div className="col">
            <RecapPanel s={s} />
          </div>
        </div>
      )}
    </Shell>
  );
}
