import type { NextRequest } from "next/server";
import { seriesAction, check } from "@/server/seriesApi";

/** What each loser owes: winner, loser, favor, status (PICKING, PENDING_CONSENT, CONSENTED, DECLINED) and done. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/assignments">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, async ({ from }) =>
    check(await from("series_favor_assignments").select("*").eq("series_id", seriesId).order("position"))
  );
}
