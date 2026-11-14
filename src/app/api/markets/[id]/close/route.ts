import type { NextRequest } from "next/server";
import { mutate } from "@/server/http";
import { closeMarket } from "@/server/markets";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/close">) {
  const { id } = await ctx.params;
  return mutate(req, (db, me) => closeMarket(db, me, id));
}
