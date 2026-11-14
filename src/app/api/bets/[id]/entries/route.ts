import type { NextRequest } from "next/server";
import { joinBet } from "@/server/bets";
import { mutate, readJson } from "@/server/http";

/** Join an open bet. Body: { outcomeId, amount } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/bets/[id]/entries">) {
  const { id } = await ctx.params;
  const { outcomeId, amount } = await readJson(req);
  return mutate(req, (db, me) => joinBet(db, me, id, outcomeId, amount), 201);
}
