import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Everything the app shows: who you are, the server clock, and every series you're in with standings and start blockers. */
export async function GET(req: NextRequest) {
  return seriesAction(req, ({ rpc }) => rpc("my_series_state"));
}
