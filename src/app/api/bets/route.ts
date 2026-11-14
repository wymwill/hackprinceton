import type { NextRequest } from "next/server";
import type { CreateBetInput } from "@/lib/bets/types";
import { createBet } from "@/server/bets";
import { mutate, readJson } from "@/server/http";

/** Create a bet. Body: CreateBetInput. The creator's stake is taken from their balance immediately. */
export async function POST(req: NextRequest) {
  const body = (await readJson(req)) as Partial<CreateBetInput>;
  return mutate(req, (db, me) => createBet(db, me, body), 201);
}
