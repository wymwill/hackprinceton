import type { NextRequest } from "next/server";
import { updateGroup } from "@/server/groups";
import { mutate, readJson } from "@/server/http";

/** Owner only. Body: any of { name, emoji, darePresets, mode, startingBalance } */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/groups/[id]">) {
  const { id } = await ctx.params;
  const body = await readJson(req);
  return mutate(req, (db, me) => ({ id: updateGroup(db, me, id, body).id }));
}
