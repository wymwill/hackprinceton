import type { NextRequest } from "next/server";
import { reviewBet } from "@/server/ai/bookie";
import { snapshot } from "@/server/bets";
import { currentUserId, errorResponse } from "@/server/http";
import { read } from "@/server/store";

/**
 * Ask the AI Bookie to review a closed bet's evidence. Anyone in the bet can ask.
 * Returns a recommendation (or a flag for human review). It never settles the bet.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/bets/[id]/review">) {
  const { id } = await ctx.params;
  const me = currentUserId(req);
  try {
    const result = await reviewBet(id, me);
    return Response.json({ result, state: await read((db) => snapshot(db, me)) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
