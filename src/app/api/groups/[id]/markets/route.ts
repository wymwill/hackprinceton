import type { NextRequest } from "next/server";
import { mutate, readJson } from "@/server/http";
import { createMarket } from "@/server/markets";

/** New market. The Bookie's opening line is worked out after the response. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/groups/[id]/markets">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return mutate(req, (db, me) => ({ id: createMarket(db, me, id, body).id }), 201);
}
