import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Host starts: coins handed out once, bets open, rules locked. Repeating it is harmless. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/start">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("start_bet_series", { p_series_id: seriesId }));
}
