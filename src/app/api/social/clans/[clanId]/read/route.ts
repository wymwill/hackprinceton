import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";
import { messageId } from "@/server/chat";

/** Mark your clan's chat read up to a message. Body: { messageId }. Answers the new chat status. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/social/clans/[clanId]/read">) {
  const { clanId } = await ctx.params;
  return seriesAction(req, ({ body, rpc }) =>
    rpc("mark_clan_chat_read", { p_clan_id: clanId, p_message_id: messageId(body.messageId) ?? 0 })
  );
}
