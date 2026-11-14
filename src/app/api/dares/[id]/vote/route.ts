import type { NextRequest } from "next/server";
import { voteDare } from "@/server/dares";
import { mutate, readJson } from "@/server/http";

/** The people a dare is owed to approve it or send it back. Body: { vote: "approve" | "redo" } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/dares/[id]/vote">) {
  const { id } = await ctx.params;
  const { vote } = await readJson(req);
  return mutate(req, (db, me) => ({ status: voteDare(db, me, id, vote).status }));
}
