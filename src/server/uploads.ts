import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";
import { UPLOAD_DIR } from "./store";

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/gif": { ext: "gif", magic: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

/** Room for the text fields and multipart boundaries on top of the image itself. */
const MAX_BODY = MAX_BYTES + 64 * 1024;

/**
 * Parse a JSON or multipart body. Images are checked by type, size and magic bytes, then saved under a random name.
 * Call it only after the caller is identified, so signed-out requests never get read or written to disk.
 */
export async function readEvidenceBody(req: Request) {
  const declared = Number(req.headers.get("content-length"));
  if (!req.headers.has("content-length") || !Number.isFinite(declared) || declared > MAX_BODY) {
    // Without a length the body would be read in full before the size check, so it's refused too.
    throw new AppError(413, "image_too_large", "Images must be 5 MB or smaller.");
  }
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const fields = { text: form.get("text") ?? undefined, claims: form.get("claims") ?? undefined };
    if (!(file instanceof File) || file.size === 0) return { kind: "text" as const, ...fields };
    const type = IMAGE_TYPES[file.type];
    if (!type) throw new AppError(400, "bad_image_type", "Images must be PNG, JPEG, GIF, or WebP.");
    if (file.size > MAX_BYTES) throw new AppError(400, "image_too_large", "Images must be 5 MB or smaller.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!type.magic(bytes)) throw new AppError(400, "bad_image_type", "That file isn't the image type it claims to be.");
    const saved = `${randomUUID()}.${type.ext}`;
    await mkdir(/*turbopackIgnore: true*/ UPLOAD_DIR, { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, saved), bytes);
    return { kind: "image" as const, ...fields, file: saved, mime: file.type };
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {}
  return { kind: "text" as const, text: body.text, claims: body.claims };
}

export const removeUpload = (file?: string) => (file ? rm(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, path.basename(file)), { force: true }) : Promise.resolve());
