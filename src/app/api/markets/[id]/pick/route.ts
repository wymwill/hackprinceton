import type { NextRequest } from "next/server";
import { mutate, readJson } from "@/server/http";
import { pick } from "@/server/markets";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/pick">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return mutate(req, (db, me) => pick(db, me, id, body.side));
}
