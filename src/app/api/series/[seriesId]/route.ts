import type { NextRequest } from "next/server";
import { seriesAction, check } from "@/server/seriesApi";

/** One series with its roster and balances (members only). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, async ({ from }) =>
    check(await from("bet_series").select("*,bet_series_participants(user_id,display_name,joined_at,balance,ready,plays)").eq("id", seriesId).maybeSingle())
  );
}
