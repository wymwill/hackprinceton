import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";

/** Host adds every member of one of their clans to the lobby. Body: { clanId }. Answers with how many were added. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/clan">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) => rpc("add_clan_to_series", { p_series_id: seriesId, p_clan_id: text(body.clanId) }));
}
