import type { NextRequest } from "next/server";
import { mutate, readJson } from "@/server/http";
import { vote } from "@/server/markets";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/vote">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return mutate(req, (db, me) => vote(db, me, id, body.vote));
}
