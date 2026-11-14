import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** The loser accepts or declines the favor picked for them. Body: { accept: boolean } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/series/assignments/[assignmentId]/respond">) {
  const { assignmentId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) =>
    rpc("respond_series_favor_assignment", { p_assignment_id: assignmentId, p_accept: body.accept === true })
  );
}
