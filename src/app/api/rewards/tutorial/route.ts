import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";
import { AppError } from "@/server/errors";
import { completedNavigationTour } from "../../../../../shared/navigationTour";

/** Complete the navigation tour; the existing account-locked RPC awards credits once. */
export async function POST(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) => {
    if (!completedNavigationTour(body.completedSteps)) {
      throw new AppError(422, "tour_incomplete", "Finish each step of the navigation tour first.");
    }
    // Compatibility with the deployed rewards RPC: the tour replaces the old
    // quiz, while its per-account completion timestamp and credit ledger stay intact.
    return rpc("complete_tutorial", { p_answers: { payout: "split", rules: "lobby", bottom: "punishment" } });
  });
}
