import type { NextRequest } from "next/server";
import { errorResponse, mutate } from "@/server/http";
import { postEvidence } from "@/server/markets";
import { readEvidenceBody, removeUpload } from "@/server/uploads";

/**
 * Post evidence once the market has closed.
 * JSON: { text, claims?: "yes" | "no" }. Multipart: file, text?, claims?
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/markets/[id]/evidence">) {
  const { id } = await ctx.params;
  let input;
  try {
    input = await readEvidenceBody(req);
  } catch (err) {
    return errorResponse(err);
  }
  const res = await mutate(req, (db, me) => postEvidence(db, me, id, input).id, 201);
  if (!res.ok) await removeUpload("file" in input ? input.file : undefined);
  return res;
}
