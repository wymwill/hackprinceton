import type { NextRequest } from "next/server";
import { suggestDareFor } from "@/server/ai/bookie";
import { currentUser, errorResponse, readJson } from "@/server/http";

/** The Bookie suggests a dare for a draft market. Body: { question, rule? } */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/groups/[id]/dare-suggestion">) {
  const { id } = await ctx.params;
  const { question, rule } = await readJson(req);
  try {
    const me = await currentUser(req);
    return Response.json({ result: await suggestDareFor(id, me, String(question ?? "").slice(0, 140), rule ? String(rule).slice(0, 160) : undefined) });
  } catch (err) {
    return errorResponse(err);
  }
}
