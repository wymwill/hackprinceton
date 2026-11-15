import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";
import { unlink } from "@/server/links";

/** Unlink an app and forget everything copied from it. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/links/[provider]/disconnect">) {
  const { provider } = await ctx.params;
  return seriesAction(req, (c) => unlink(c, provider));
}
