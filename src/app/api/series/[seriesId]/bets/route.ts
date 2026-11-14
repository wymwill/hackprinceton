import type { NextRequest } from "next/server";
import { seriesAction, check, text } from "@/server/seriesApi";

/** Bets in order, with their wagers and per-player results. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, async ({ from }) =>
    check(await from("series_bets").select("*,series_wagers(*),series_bet_results(*)").eq("series_id", seriesId).order("position"))
  );
}

/** Host writes a YES/NO bet: in the lobby, or mid-series when allowed. Body: { question } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) => rpc("create_series_bet", { p_series_id: seriesId, p_question: text(body.question) }), 201);
}
