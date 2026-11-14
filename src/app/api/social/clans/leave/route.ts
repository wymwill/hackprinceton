import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";

/** Leave one clan. Body: { clanId }. */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) => rpc("leave_clan", { p_clan_id: text(body.clanId) }));
}
