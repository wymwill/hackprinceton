import type { NextRequest } from "next/server";
import { createGroup } from "@/server/groups";
import { mutate, readJson } from "@/server/http";

/** Create a group. Body: { name, emoji?, mode: "tokens" | "points", startingBalance? } */
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  return mutate(req, (db, me) => ({ id: createGroup(db, me, body).id }), 201);
}
