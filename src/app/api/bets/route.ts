import { after, type NextRequest } from "next/server";
import type { CreateBetInput } from "@/lib/bets/types";
import { refreshOdds } from "@/server/ai/bookie";
import { aiMode } from "@/server/ai/config";
import { createBet } from "@/server/bets";
import { mutate, readJson } from "@/server/http";

/**
 * Create a bet. Body: CreateBetInput. The creator's stake is taken from their
 * balance immediately, and a stats-based estimate is stored right away. With
 * Claude on, the AI Bookie's estimate follows once the response is sent.
 */
export async function POST(req: NextRequest) {
  const body = (await readJson(req)) as Partial<CreateBetInput>;
  let betId: string | undefined;
  const res = await mutate(req, (db, me) => {
    const bet = createBet(db, me, body);
    betId = bet.id;
    return bet;
  }, 201);
  if (res.ok && betId && aiMode() === "claude") {
    const id = betId;
    after(() => refreshOdds(id, "created").catch((e) => console.error("[bookie] odds after create failed", e)));
  }
  return res;
}
