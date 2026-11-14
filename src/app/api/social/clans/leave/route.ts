import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Leave your clan. */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ rpc }) => rpc("leave_clan"));
}
