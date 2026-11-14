import type { NextRequest } from "next/server";
import { num, outcomeRef, seriesAction, texts } from "@/server/seriesApi";

/**
 * Host settles the bet. Body: { outcomeId } (or the older { outcome: "YES" | "NO" }).
 * For a tie on a multiple-choice bet: { tiedOutcomeIds: [...] } (2 or more); the bet's
 * tie rule, set before betting, decides what happens.
 * For a numerical range bet: { value } (the measured number); the matching range wins. Naming
 * an outcome for a range bet is refused.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/resolve">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) =>
    rpc("finish_series_bet", {
      p_series_id: seriesId,
      p_bet_id: betId,
      p_outcome: outcomeRef(body),
      p_cancel: false,
      ...(Array.isArray(body.tiedOutcomeIds) ? { p_tied: texts(body.tiedOutcomeIds) } : {}),
      ...(body.value !== undefined ? { p_value: num(body.value) } : {}),
    })
  );
}
