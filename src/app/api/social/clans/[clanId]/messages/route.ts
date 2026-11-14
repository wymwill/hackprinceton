import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";
import { messageId } from "@/server/chat";

/**
 * A page of your clan's chat, oldest first: the newest 50 by default,
 * ?before=<id> for older ones, ?after=<id> for anything newer (catching up).
 * ?limit= up to 100. Answers { messages, hasMore, lastReadId, unread }.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/social/clans/[clanId]/messages">) {
  const { clanId } = await ctx.params;
  const q = req.nextUrl.searchParams;
  return seriesAction(req, ({ rpc }) =>
    rpc("clan_messages_page", {
      p_clan_id: clanId,
      p_before: messageId(q.get("before")),
      p_after: messageId(q.get("after")),
      p_limit: messageId(q.get("limit")) ?? 50,
    })
  );
}

/** Send a message as yourself. Body: { body, clientId? } (clientId: a UUID; resending it returns the first message). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/social/clans/[clanId]/messages">) {
  const { clanId } = await ctx.params;
  return seriesAction(
    req,
    ({ body, rpc }) =>
      rpc("send_clan_message", {
        p_clan_id: clanId,
        p_body: text(body.body),
        p_client_id: typeof body.clientId === "string" && /^[0-9a-f-]{36}$/i.test(body.clientId) ? body.clientId : null,
      }),
    201
  );
}
