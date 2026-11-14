import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";

/** Add a friend by their friend code. Body: { code } */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) => rpc("add_friend", { p_code: text(body.code) }));
}
