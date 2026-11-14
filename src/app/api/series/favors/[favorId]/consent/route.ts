import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Shared pool: agree (or stop agreeing) to someone else's favor. Body: { consent: boolean } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/favors/[favorId]/consent">) {
  const { favorId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) => rpc("consent_series_favor", { p_favor_id: favorId, p_consent: body.consent === true }));
}
