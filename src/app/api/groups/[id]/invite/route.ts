import type { NextRequest } from "next/server";
import { resetInvite } from "@/server/groups";
import { mutate } from "@/server/http";

/** Owner only. Replaces the invite code, so the old link stops working. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/groups/[id]/invite">) {
  const { id } = await ctx.params;
  return mutate(req, (db, me) => resetInvite(db, me, id));
}
