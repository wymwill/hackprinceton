import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";

/** Join a lobby by its invite code. Body: { code } */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) => rpc("join_bet_series_by_code", { p_code: text(body.code) }));
}
