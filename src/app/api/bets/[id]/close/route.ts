import type { NextRequest } from "next/server";
import { closeBet } from "@/server/bets";
import { mutate } from "@/server/http";

/** Stop new entries before the deadline. Creator only. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/bets/[id]/close">) {
  const { id } = await ctx.params;
  return mutate(req, (db, me) => closeBet(db, me, id));
}
