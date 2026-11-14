import type { NextRequest } from "next/server";
import { mutate, readJson } from "@/server/http";
import { proposeResult } from "@/server/markets";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/result">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return mutate(req, (db, me) => proposeResult(db, me, id, body.outcome));
}
