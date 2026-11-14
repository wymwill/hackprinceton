import type { NextRequest } from "next/server";
import { query } from "@/server/http";
import { snapshot } from "@/server/views";

/** Everything the screens need. `?group=` picks the group; leave it off for just your groups. */
export async function GET(req: NextRequest) {
  const group = req.nextUrl.searchParams.get("group");
  return query(req, (db, me) => snapshot(db, me, group));
}
