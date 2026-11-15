import type { NextRequest } from "next/server";
import { AppError } from "@/server/errors";
import { seriesAction } from "@/server/seriesApi";

/** A series member's proof from linked apps. Query: ?series=&user=&since=&provider=&kind= (the last three optional). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return seriesAction(req, ({ rpc }) => {
    if (q.get("provider") && q.get("provider") !== "github") throw new AppError(400, "unknown_provider", "Only GitHub proof is available.");
    if (q.get("kind") && !["push", "pull_request"].includes(q.get("kind")!)) throw new AppError(400, "invalid_kind", "Choose pushes or merged pull requests.");
    return rpc("link_proof_for", {
      p_series_id: q.get("series") ?? "",
      p_user_id: q.get("user") ?? "",
      p_since: q.get("since") || null,
      p_provider: "github",
      p_kind: q.get("kind") || null,
    });
  });
}
