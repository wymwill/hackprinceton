import type { NextRequest } from "next/server";
import { invitePreview } from "@/server/groups";
import { query } from "@/server/http";

/** Preview a group from its invite code, for the /join/[code] page. Joining is still POST /api/groups/join. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/invites/[code]">) {
  const { code } = await ctx.params;
  return query(req, (db, me) => ({ result: invitePreview(db, me, code) }));
}
