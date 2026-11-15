import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

/** Finish the tutorial. Body: { answers: { payout, rules, bottom } }. The first correct finish gives 200 credits. */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) =>
    rpc("complete_tutorial", { p_answers: body.answers && typeof body.answers === "object" ? body.answers : {} })
  );
}
