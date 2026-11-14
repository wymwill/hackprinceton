import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Ranked players: rank, display_name, balance (settled coins), available, at_stake, is_loser (bottom X). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/leaderboard">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("series_leaderboard", { p_series_id: seriesId }));
}
