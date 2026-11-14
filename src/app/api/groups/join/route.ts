import type { NextRequest } from "next/server";
import { joinGroup } from "@/server/groups";
import { mutate, readJson } from "@/server/http";

/** Join a group with its invite code. Body: { code } */
export async function POST(req: NextRequest) {
  const { code } = await readJson(req);
  return mutate(req, (db, me) => ({ id: joinGroup(db, me, code).id }));
}
