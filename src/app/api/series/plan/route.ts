import { seriesAction } from "@/server/seriesApi";
import { AppError } from "@/server/errors";
import { GamePlannerInput } from "../../../../../shared/gamePlan";
import { generateGamePlan } from "@/server/planner/agent";
import { limitPlanner } from "@/server/planner/limits";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Authenticated draft generation only; no series, bets, or punishments are saved. */
export async function POST(req: Request) {
  return seriesAction(req, async ({ userId, body }) => {
    const input = GamePlannerInput.safeParse(body);
    if (!input.success) throw new AppError(400, "invalid_plan_request", "Describe your game in 12–1,000 characters, choose 2–20 players and 3–8 questions.");
    return limitPlanner(userId, () => generateGamePlan(input.data, { signal: req.signal }));
  });
}
