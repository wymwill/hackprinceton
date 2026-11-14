import type { NextRequest } from "next/server";
import { decideReview } from "@/server/bets";
import { mutate, readJson } from "@/server/http";

/**
 * The bet's creator confirms or rejects an AI recommendation.
 * Body: { reviewId, action: "confirm" | "reject", note? }. Rejecting needs a note.
 * Confirming settles through the same once-only path as /settle.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/bets/[id]/decision">) {
  const { id } = await ctx.params;
  const { reviewId, action, note } = await readJson(req);
  return mutate(req, (db, me) => decideReview(db, me, id, reviewId, action, note));
}
