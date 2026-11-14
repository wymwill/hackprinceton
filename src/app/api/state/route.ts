import type { NextRequest } from "next/server";
import { snapshot } from "@/server/bets";
import { currentUserId, errorResponse } from "@/server/http";
import { read } from "@/server/store";

/** Everything the screens need: who you are, every friend's balance and record, and every bet. */
export async function GET(req: NextRequest) {
  // Read the cookie outside the try so Next's "this route is dynamic" signal isn't caught.
  const me = currentUserId(req);
  try {
    return Response.json(await read((db) => snapshot(db, me)));
  } catch (err) {
    return errorResponse(err);
  }
}
