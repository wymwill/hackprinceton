import { AppError } from "../errors.ts";

/** Per-server bounds on paid generation. Requests never lock series or betting. */
export function createPlannerLimiter(now = Date.now) {
  const users = new Map<string, { at: number; count: number; busy: boolean }>();
  return async function limited<T>(userId: string, run: () => Promise<T>): Promise<T> {
    const time = now();
    for (const [id, state] of users) if (!state.busy && time - state.at > 60_000) users.delete(id);
    const state = users.get(userId) ?? { at: time, count: 0, busy: false };
    if (state.busy || state.count >= 3 || users.size >= 1000 && !users.has(userId)) {
      throw new AppError(429, "planner_busy", "Please wait a minute before generating another game.");
    }
    state.busy = true; state.count += 1; users.set(userId, state);
    try { return await run(); } finally { state.busy = false; }
  };
}
export const limitPlanner = createPlannerLimiter();
