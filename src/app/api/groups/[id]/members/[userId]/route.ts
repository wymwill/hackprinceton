import type { NextRequest } from "next/server";
import { removeMember } from "@/server/groups";
import { mutate } from "@/server/http";

/** Owner only. Removes someone from the group. */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/groups/[id]/members/[userId]">) {
  const { id, userId } = await ctx.params;
  return mutate(req, (db, me) => removeMember(db, me, id, userId));
}
