import { after, type NextRequest } from "next/server";
import type { CreateBetInput } from "@/lib/bets/types";
import { setOpeningLine } from "@/server/ai/bookie";
import { aiMode } from "@/server/ai/config";
import { createBet } from "@/server/bets";
import { mutate, readJson } from "@/server/http";

/**
 * Create a bet. Body: CreateBetInput. The creator's stake is taken from their
 * balance immediately, and a history-based estimate and opening line are stored
 * right away. With Claude on, the bet is marked "thinking" and the AI Bookie's
 * Deep Agent sets the opening line after the response is sent, so creating a
 * bet stays instant.
 */
export async function POST(req: NextRequest) {
  const body = (await readJson(req)) as Partial<CreateBetInput>;
  const useAgent = aiMode() === "claude";
  let betId: string | undefined;
  const res = await mutate(
    req,
    (db, me) => {
      const bet = createBet(db, me, body);
      if (useAgent) bet.bookie = { status: "thinking", at: new Date().toISOString() };
      betId = bet.id;
      return bet;
    },
    201
  );
  if (res.ok && betId && useAgent) {
    const id = betId;
    after(() => setOpeningLine(id));
  }
  return res;
}
