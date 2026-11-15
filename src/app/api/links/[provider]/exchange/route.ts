import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";
import { exchange, linkGithub } from "@/server/links";

/**
 * Finish linking. OAuth apps: { code, scope, redirectUri, codeVerifier } from /connect/:provider/callback.
 * GitHub: { username }.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/links/[provider]/exchange">) {
  const { provider } = await ctx.params;
  return seriesAction(req, (c) => (provider === "github" ? linkGithub(c) : exchange(c, provider)));
}
