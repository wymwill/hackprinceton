import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** A series member's proof from linked apps. Query: ?series=&user=&since=&provider=&kind= (the last three optional). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return seriesAction(req, ({ rpc }) =>
    rpc("link_proof_for", {
      p_series_id: q.get("series") ?? "",
      p_user_id: q.get("user") ?? "",
      p_since: q.get("since") || null,
      p_provider: q.get("provider") || null,
      p_kind: q.get("kind") || null,
    })
  );
}
