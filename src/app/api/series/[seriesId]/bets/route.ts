import type { NextRequest } from "next/server";
import { closesAtOf, betShape, seriesAction, check, text } from "@/server/seriesApi";

/** Bets in order, with their wagers and per-player results. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, async ({ from }) =>
    check(await from("series_bets").select("*,series_wagers(*),series_bet_results(*)").eq("series_id", seriesId).order("position"))
  );
}

/**
 * Host writes a bet: in the lobby, or mid-series when allowed (it opens right away).
 * Body: { question, closesAt?: ISO date-time with offset, outcomes?: string[] (2..10, unique), tieRule?: "refund" | "first_listed" }, or for a
 * numerical range { question, kind: "range", ranges: [{ lower, upper }], unit?, decimals? }.
 * No outcomes = a YES/NO bet.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets">) {
  const { seriesId } = await ctx.params;
  return seriesAction(
    req,
    ({ body, rpc }) =>
      rpc("create_series_bet", { p_series_id: seriesId, p_question: text(body.question), ...betShape(body), p_closes_at: closesAtOf(body) ?? null }),
    201
  );
}
