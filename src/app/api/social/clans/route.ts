import type { NextRequest } from "next/server";
import { seriesAction, text } from "@/server/seriesApi";

/** Start a clan. Body: { name } */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) => rpc("create_clan", { p_name: text(body.name) }), 201);
}
