import type { NextRequest } from "next/server";
import { mutate, readJson } from "@/server/http";
import { trade } from "@/server/markets";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/trade">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return mutate(req, (db, me) => trade(db, me, id, body));
}
