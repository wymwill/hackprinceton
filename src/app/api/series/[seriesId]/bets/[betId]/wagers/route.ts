import type { NextRequest } from "next/server";
import { outcomeRef, requestIdOf, seriesAction } from "@/server/seriesApi";

/**
 * Put coins on one of the bet's outcomes (add to yours; no switching).
 * Body: { outcomeId, amount, requestId? }. The older { outcome: "YES" | "NO", amount } still works.
 *
 * With requestId (a UUID the app makes per intended wager), the wager happens at most
 * once: repeating the request returns the original receipt { wagerId, amount,
 * previousStake, totalStake, addedToExisting, available, replayed, ... } instead of
 * betting again, and reusing the id for a different wager is 409 request_id_reused.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]/wagers">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(
    req,
    ({ body, rpc }) => {
      const requestId = requestIdOf(body);
      const args = { p_series_id: seriesId, p_bet_id: betId, p_outcome: outcomeRef(body), p_amount: body.amount };
      return requestId ? rpc("place_series_wager_once", { p_request_id: requestId, ...args }) : rpc("place_series_wager", args);
    },
    201
  );
}
