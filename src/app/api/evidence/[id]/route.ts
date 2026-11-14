import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { read, UPLOAD_DIR } from "@/server/store";

/** Serve an uploaded evidence image. Ids are random and the file name never comes from the request. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/evidence/[id]">) {
  const { id } = await ctx.params;
  const ev = await read((db) => db.evidence.find((e) => e.id === id));
  if (!ev?.file || !ev.mime) return new Response("Not found", { status: 404 });
  const bytes = await readFile(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, path.basename(ev.file)));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": ev.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
