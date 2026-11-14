import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Your clan and its unread message count: { clanId, lastId, unread } (clanId null when you're in none). */
export async function GET(req: NextRequest) {
  return seriesAction(req, ({ rpc }) => rpc("clan_chat_status"));
}
