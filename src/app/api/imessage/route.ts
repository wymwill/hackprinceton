import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/**
 * Text Bookie: link a phone to your account so you can bet over iMessage (agent/index.ts).
 *   GET    → { address, links }: Bookie's number (null until it's set up) and your linked phones, masked.
 *   POST   → { code, expiresAt }: a one-time code; text "link CODE" to Bookie within 15 minutes.
 *   DELETE ?id= → unlink one phone (id from GET), or all of them without ?id.
 */
export async function GET(req: NextRequest) {
  return seriesAction(req, async ({ rpc }) => ({
    address: process.env.BOOKIE_IMESSAGE_ADDRESS || null,
    links: await rpc("imessage_links"),
  }));
}

export async function POST(req: NextRequest) {
  return seriesAction(req, ({ rpc }) => rpc("imessage_link_code"), 201);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  return seriesAction(req, async ({ rpc }) => ({ removed: await rpc("imessage_unlink", { p_id: id }) }));
}
