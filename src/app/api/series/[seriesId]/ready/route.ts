import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** "I'm ready". In a shared pool it also agrees to every favor in it. Body: { ready: boolean } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/ready">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) => rpc("set_series_ready", { p_series_id: seriesId, p_ready: body.ready === true }));
}
