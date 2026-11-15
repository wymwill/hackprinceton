import { createHash } from "node:crypto";
import { seriesAction } from "@/server/seriesApi";
import { commentOnEvent } from "@/server/house/service";
import type { AppState } from "../../../../frontend/src/lib/types";
import { getWrappedSummary } from "../../../../shared/wrapped";

export const runtime = "nodejs";

/** Private, authenticated, read-only annual recap. Only the caller's existing RLS snapshot is read. */
export async function GET(req: Request) {
  const yearParam = new URL(req.url).searchParams.get("year");
  const year = yearParam === null ? new Date().getUTCFullYear() : Number(yearParam);
  if (!Number.isInteger(year) || year < 2000 || year > new Date().getUTCFullYear() + 1) {
    return Response.json({ error: { message: "Choose a valid recap year." } }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const response = await seriesAction(req, async ({ rpc, userId }) => {
    const state = await rpc("my_series_state") as AppState;
    const summary = getWrappedSummary(state.series, userId, state.me.name, year);
    const fingerprint = createHash("sha256").update(JSON.stringify({ year, bets: summary.totalBets, wagered: summary.totalWagered, net: summary.net, wins: summary.wins, archetype: summary.archetype.id, best: summary.best?.betId, worst: summary.worst?.betId })).digest("hex").slice(0, 24);
    const safeName = state.me.name.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 40);
    const fact = summary.totalBets
      ? `${safeName}'s ${year} recap: ${summary.totalBets} bets, ${summary.wins} eligible wins, ${summary.net > 0 ? "+" : ""}${summary.net} net virtual coins.`
      : `${safeName}'s ${year} recap has no recorded wagers yet.`;
    const verdict = await commentOnEvent({
      id: `wrapped/${year}/${fingerprint}`, seriesId: "wrapped", betId: `wrapped-${year}-${fingerprint}`,
      kind: "bet_resolved", flavor: "wrapped", at: new Date().toISOString(), fact,
      signals: { bets: summary.totalBets, wins: summary.wins, winRate: summary.winRate ?? 0, net: summary.net },
    }, userId);
    return { summary, verdict };
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
