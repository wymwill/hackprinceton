import type { NextRequest } from "next/server";
import { closesAt, num, seriesAction, setClose } from "@/server/seriesApi";

/** Host deletes a bet that hasn't opened yet (lobby only). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("remove_series_bet", { p_series_id: seriesId, p_bet_id: betId }));
}

/**
 * Host edits a bet. Every field is optional:
 * { question?, kind?: "binary" | "multi" | "range", outcomes?: [{ id?, label }] in order, tieRule?,
 *   ranges?: [{ lower, upper }], unit?, decimals?, closesAt?: ISO time | null }.
 * Outcomes listed with their id keep it (rename or move); ones left out are removed.
 * 409 outcomes_locked once the bet has opened, except closesAt: that can change on an open
 * bet until its close time passes (null removes it).
 */
const DRAFT_FIELDS = ["question", "kind", "outcomes", "tieRule", "ranges", "unit", "decimals"];

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets/[betId]">) {
  const { seriesId, betId } = await ctx.params;
  return seriesAction(req, async ({ body, rpc }) => {
    const close = closesAt(body);
    let result: unknown = null;
    if (close === undefined || DRAFT_FIELDS.some((f) => f in body)) {
      result = await rpc("update_series_bet", {
        p_series_id: seriesId,
        p_bet_id: betId,
        p_question: typeof body.question === "string" ? body.question : null,
        p_kind: typeof body.kind === "string" ? body.kind : null,
        p_outcomes: Array.isArray(body.outcomes) ? body.outcomes : null,
        p_tie_rule: typeof body.tieRule === "string" ? body.tieRule : null,
        p_ranges: Array.isArray(body.ranges) ? body.ranges : null,
        p_unit: typeof body.unit === "string" ? body.unit : null,
        p_decimals: num(body.decimals),
      });
    }
    if (close !== undefined) {
      const c = await setClose(rpc, seriesId, betId, close);
      result = result && typeof result === "object" ? { ...result, closes_at: close } : c;
    }
    return result;
  });
}
