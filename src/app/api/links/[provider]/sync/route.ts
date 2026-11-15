import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";
import { sync } from "@/server/links";

/** Copy recent proof in from a linked app. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/links/[provider]/sync">) {
  const { provider } = await ctx.params;
  return seriesAction(req, (c) => sync(c, provider));
}
