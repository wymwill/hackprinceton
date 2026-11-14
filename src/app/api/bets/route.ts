import { after, type NextRequest } from "next/server";
import type { CreateBetInput } from "@/lib/bets/types";
import { setOpeningLine } from "@/server/ai/bookie";
import { createBet } from "@/server/bets";
import { mutate, readJson } from "@/server/http";

/**
 * Create a bet. Body: CreateBetInput. The creator's stake is taken from their balance immediately.
 * The AI Bookie sets the opening line after the response is sent, so creating a bet stays instant.
 */
export async function POST(req: NextRequest) {
  const body = (await readJson(req)) as Partial<CreateBetInput>;
  let betId: string | undefined;
  const res = await mutate(
    req,
    (db, me) => {
      const bet = createBet(db, me, body);
      bet.bookie = { status: "thinking", at: new Date().toISOString() };
      betId = bet.id;
      return bet;
    },
    201
  );
  if (betId) {
    const id = betId;
    after(() => setOpeningLine(id));
  }
  return res;
}
