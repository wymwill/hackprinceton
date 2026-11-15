import type { NextRequest } from "next/server";
import { betShape, closesAt, seriesAction, check, setClose, text } from "@/server/seriesApi";

/** Bets in order, with their wagers and per-player results. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, async ({ from }) =>
    check(await from("series_bets").select("*,series_wagers(*),series_bet_results(*)").eq("series_id", seriesId).order("position")),
  );
}

/**
 * Host writes a bet: in the lobby, or mid-series when allowed (it opens right away).
 * Body: { question, outcomes?: string[] (2..10, unique), tieRule?: "refund" | "first_listed" }, or for a
 * numerical range { question, kind: "range", ranges: [{ lower, upper }], unit?, decimals? }.
 * No outcomes = a YES/NO bet. Add closesAt (an ISO time in the future) to stop betting at that time.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/bets">) {
  const { seriesId } = await ctx.params;
  return seriesAction(
    req,
    async ({ body, rpc }) => {
      const close = closesAt(body);
      const bet = (await rpc("create_series_bet", { p_series_id: seriesId, p_question: text(body.question), ...betShape(body) })) as { id: string };
      if (close) {
        await setClose(rpc, seriesId, bet.id, close);
        return { ...bet, closes_at: close };
      }
      return bet;
    },
    201,
  );
}
