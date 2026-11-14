import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { identify, userFor, type Identity } from "@/server/auth";
import { read, UPLOAD_DIR } from "@/server/store";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Serve an uploaded evidence image to members of the market's group. Ids are
 * random and the file name never comes from the request. Anyone else, or a
 * missing file, gets a plain 404 so the route doesn't reveal what exists.
 * That includes anyone signed out.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/evidence/[id]">) {
  const { id } = await ctx.params;
  let who: Identity;
  try {
    who = await identify(req);
  } catch {
    return notFound();
  }
  const ev = await read((db) => {
    const e = db.evidence.find((x) => x.id === id);
    const market = e && db.markets.find((m) => m.id === e.marketId);
    const me = userFor(db, who);
    const member = market && db.memberships.some((m) => m.groupId === market.groupId && m.userId === me);
    return member ? e : undefined;
  });
  if (!ev?.file || !ev.mime) return notFound();
  let bytes: Buffer;
  try {
    bytes = await readFile(/*turbopackIgnore: true*/ path.join(UPLOAD_DIR, path.basename(ev.file)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return notFound();
    throw err;
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": ev.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
