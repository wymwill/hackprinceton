import type { NextRequest } from "next/server";
import { settleBet } from "@/server/bets";
import { mutate, readJson } from "@/server/http";

/**
 * Record the result and pay out. Body: { outcomeId }. Creator only, after entries close.
 * Retrying with the same outcome returns the original receipt without paying again.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/bets/[id]/settle">) {
  const { id } = await ctx.params;
  const { outcomeId } = await readJson(req);
  return mutate(req, (db, me) => settleBet(db, me, id, outcomeId));
}
