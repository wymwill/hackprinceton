import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Your friend code, your friends, your clan and the clan leaderboard. */
export async function GET(req: NextRequest) {
  return seriesAction(req, ({ rpc }) => rpc("my_social_state"));
}
