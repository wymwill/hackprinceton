import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, type NextRequest } from "next/server";
import { refreshOdds } from "@/server/ai/bookie";
import { aiMode } from "@/server/ai/config";
import { BetError, addEvidence, type EvidenceInput } from "@/server/bets";
import { errorResponse, mutate, readJson } from "@/server/http";
import { UPLOAD_DIR } from "@/server/store";

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/gif": { ext: "gif", magic: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

/**
 * Submit evidence for a bet. Anyone in the bet can submit until it's settled.
 * JSON for text and links: { kind: "text" | "link", text?, url?, claimsOutcomeId? }
 * multipart/form-data for images: file, text?, claimsOutcomeId?
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/bets/[id]/evidence">) {
  const { id } = await ctx.params;
  let input: EvidenceInput;
  let saved: string | undefined;

  try {
    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new BetError(400, "missing_image", "Attach an image.");
      const type = IMAGE_TYPES[file.type];
      if (!type) throw new BetError(400, "bad_image_type", "Images must be PNG, JPEG, GIF, or WebP.");
      if (file.size > MAX_BYTES) throw new BetError(400, "image_too_large", "Images must be 5 MB or smaller.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!type.magic(bytes)) throw new BetError(400, "bad_image_type", "That file isn't the image type it claims to be.");
      saved = `${randomUUID()}.${type.ext}`;
      await mkdir(/*turbopackIgnore: true*/ UPLOAD_DIR, { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, saved), bytes);
      input = { kind: "image", text: form.get("text"), claimsOutcomeId: form.get("claimsOutcomeId") || undefined, file: saved, mime: file.type };
    } else {
      const body = await readJson(req);
      input = { kind: body.kind as EvidenceInput["kind"], text: body.text, url: body.url, claimsOutcomeId: body.claimsOutcomeId };
    }
  } catch (err) {
    return errorResponse(err);
  }

  let open = false;
  const res = await mutate(req, (db, me) => {
    const ev = addEvidence(db, me, id, input);
    const bet = db.bets.find((b) => b.id === id)!;
    open = !bet.receiptId && Date.now() < Date.parse(bet.deadline);
    return ev;
  }, 201);

  if (!res.ok && saved) await rm(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, saved), { force: true });
  // New evidence on an open bet: let the AI Bookie update its odds.
  if (res.ok && open && aiMode() === "claude") {
    after(() => refreshOdds(id, "evidence").catch((e) => console.error("[bookie] odds after evidence failed", e)));
  }
  return res;
}
