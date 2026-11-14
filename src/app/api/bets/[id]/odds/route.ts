import type { NextRequest } from "next/server";
import { refreshOdds } from "@/server/ai/bookie";
import { snapshot } from "@/server/bets";
import { currentUserId, errorResponse } from "@/server/http";
import { read } from "@/server/store";

/** Re-run the AI Bookie's odds for a bet that isn't settled yet. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/bets/[id]/odds">) {
  const { id } = await ctx.params;
  const me = currentUserId(req);
  try {
    const result = await refreshOdds(id, "manual");
    return Response.json({ result, state: await read((db) => snapshot(db, me)) });
  } catch (err) {
    return errorResponse(err);
  }
}
