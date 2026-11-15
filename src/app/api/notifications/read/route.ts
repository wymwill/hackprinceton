import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Mark reminders seen. Body: { ids?: number[] } (all of yours when ids is missing). */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) => {
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => Number.isSafeInteger(x) && (x as number) > 0) : null;
    return rpc("mark_notifications_read", { p_ids: ids });
  });
}
