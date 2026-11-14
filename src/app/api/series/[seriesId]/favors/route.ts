import type { NextRequest } from "next/server";
import { seriesAction, check, text } from "@/server/seriesApi";

/** Favors in the series (not withdrawn), with who agreed to each (consented_by). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/favors">) {
  const { seriesId } = await ctx.params;
  return seriesAction(req, async ({ from }) =>
    check(await from("series_favors").select("*").eq("series_id", seriesId).eq("withdrawn", false).order("created_at"))
  );
}

/** Add a favor to the pool, or replace your pledge. Body: { description } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/[seriesId]/favors">) {
  const { seriesId } = await ctx.params;
  return seriesAction(
    req,
    ({ body, rpc }) => rpc("propose_series_favor", { p_series_id: seriesId, p_description: text(body.description ?? body.text) }),
    201
  );
}
