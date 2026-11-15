import type { NextRequest } from "next/server";
import { closesAtOf, num, seriesAction } from "@/server/seriesApi";

/** Host deletes a bet that hasn't opened yet (lobby only). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("remove_series_bet", { p_series_id: seriesId, p_bet_id: betId }));
}

/**
 * Host edits a draft bet (before betting on it opens). Every field is optional:
 * { question?, kind?: "binary" | "multi" | "range", outcomes?: [{ id?, label }] in order, tieRule?,
 *   ranges?: [{ lower, upper }], unit?, decimals? }.
 * Outcomes listed with their id keep it (rename or move); ones left out are removed.
 * 409 outcomes_locked once the bet has opened.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, async ({ body, rpc }) => {
    // Optional { closesAt }: set, move or clear (null) the closing time, here or on an open bet.
    const closesAt = closesAtOf(body);
    const edits = ["question", "kind", "outcomes", "tieRule", "ranges", "unit", "decimals"].some((k) => k in body);
    let bet: unknown = edits ? await rpc("update_series_bet", {
      p_series_id: seriesId,
      p_bet_id: betId,
      p_question: typeof body.question === "string" ? body.question : null,
      p_kind: typeof body.kind === "string" ? body.kind : null,
      p_outcomes: Array.isArray(body.outcomes) ? body.outcomes : null,
      p_tie_rule: typeof body.tieRule === "string" ? body.tieRule : null,
      p_ranges: Array.isArray(body.ranges) ? body.ranges : null,
      p_unit: typeof body.unit === "string" ? body.unit : null,
      p_decimals: num(body.decimals),
    }) : null;
    if (closesAt !== undefined) bet = await rpc("set_series_bet_deadline", { p_series_id: seriesId, p_bet_id: betId, p_closes_at: closesAt });
    return bet;
  });
}
