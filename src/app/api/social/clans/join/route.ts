import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";

/** Join a clan by its code. Body: { code } */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) => rpc("join_clan", { p_code: text(body.code) }));
}
