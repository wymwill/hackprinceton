import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/**
 * Your reminders, brought up to date: { prefs, notifications, unread }. Only kinds you
 * turned on, one per action, gone once the action is done (see migration 0019).
 */
export async function GET(req: NextRequest) {
  return seriesAction(req, ({ rpc }) => rpc("my_notifications"));
}
