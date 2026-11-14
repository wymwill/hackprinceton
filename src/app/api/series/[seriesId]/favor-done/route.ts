import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** A loser marks their accepted favor as done. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/favor-done">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("mark_series_favor_done", { p_series_id: seriesId }));
}
