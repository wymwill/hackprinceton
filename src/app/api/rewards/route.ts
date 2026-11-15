import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Your credits and whether you've finished the tutorial. */
export async function GET(req: NextRequest) {
  return seriesAction(req, ({ rpc }) => rpc("my_credits"));
}
