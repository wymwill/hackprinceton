import type { NextRequest } from "next/server";
import { postProof } from "@/server/dares";
import { identify } from "@/server/auth";
import { errorResponse, mutate } from "@/server/http";
import { newId } from "@/server/store";
import { readEvidenceBody, removeUpload } from "@/server/uploads";

/** The person who owes the dare posts proof. JSON: { text }. Multipart: file, text? */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/dares/[id]/proof">) {
  const { id } = await ctx.params;
  let input;
  try {
    // Who's asking comes first: a signed-out request never gets its body read or saved.
    await identify(req);
    input = await readEvidenceBody(req);
  } catch (err) {
    return errorResponse(err);
  }
  const file = "file" in input ? input.file : undefined;
  const res = await mutate(req, (db, me) => {
    let evidenceId: string | undefined;
    if (file) {
      const dare = db.dares.find((d) => d.id === id);
      evidenceId = newId("ev");
      // Saved like evidence so the image route can serve it.
      postProof(db, me, id, { text: input.text, evidenceId });
      db.evidence.push({ id: evidenceId, marketId: dare!.marketId, userId: me, kind: "image", dareProof: true, file, mime: "mime" in input ? input.mime : undefined, createdAt: new Date().toISOString() });
      return { status: dare!.status };
    }
    return { status: postProof(db, me, id, { text: input.text }).status };
  });
  if (!res.ok) await removeUpload(file);
  return res;
}
