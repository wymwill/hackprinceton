import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Remove a friend. */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/social/friends/[userId]">) {
  const { userId } = await ctx.params;
  return seriesAction(req, ({ rpc }) => rpc("remove_friend", { p_user_id: userId }));
}
