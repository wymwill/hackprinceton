import type { NextRequest } from "next/server";
import { AppError } from "@/server/errors";
import { seriesAction } from "@/server/seriesApi";
import { messageId } from "@/server/chat";

/** Delete one of your own messages (its text is wiped; a "deleted" marker stays). */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/social/clans/[clanId]/messages/[messageId]">) {
  const { messageId: raw } = await ctx.params;
  return seriesAction(req, ({ rpc }) => {
    const id = messageId(raw);
    if (id === null) throw new AppError(404, "message_not_found", "That message doesn't exist.");
    return rpc("delete_clan_message", { p_message_id: id });
  });
}
