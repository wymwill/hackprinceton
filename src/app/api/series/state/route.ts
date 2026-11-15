import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/**
 * Everything the app shows: who you are, the server clock, and every series you're in with standings and start blockers.
 * Bets past their closing time are closed first (they already read as closed; this makes it permanent and refunds
 * one-sided pools), so nobody has to wait for the host or a scheduled job.
 */
export async function GET(req: NextRequest) {
  return seriesAction(req, async ({ rpc }) => {
    await rpc("close_due_bets");
    return rpc("my_series_state");
  });
}
