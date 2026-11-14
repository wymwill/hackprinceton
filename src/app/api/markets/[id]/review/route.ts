import type { NextRequest } from "next/server";
import { requestReview } from "@/server/ai/bookie";
import { currentUser, errorResponse } from "@/server/http";

/** Ask the Bookie to review the evidence. It recommends; it never settles. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/review">) {
  const { id } = await ctx.params;
  try {
    const me = await currentUser(req);
    return Response.json({ result: await requestReview(id, me) });
  } catch (err) {
    return errorResponse(err);
  }
}
