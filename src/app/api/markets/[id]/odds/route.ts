import type { NextRequest } from "next/server";
import { requestRecheck } from "@/server/ai/bookie";
import { AppError } from "@/server/errors";
import { currentUser, errorResponse } from "@/server/http";
import { requireMarket } from "@/server/markets";
import { read } from "@/server/store";

/** Ask the Bookie to re-check its estimate. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/odds">) {
  const { id } = await ctx.params;
  try {
    const me = await currentUser(req);
    await read((db) => requireMarket(db, me, id));
    const est = await requestRecheck(id);
    if (!est) throw new AppError(409, "market_settled", "This market is already settled.");
    return Response.json({ result: est });
  } catch (err) {
    return errorResponse(err);
  }
}
