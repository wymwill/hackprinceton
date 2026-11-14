import { seriesAction } from "@/server/seriesApi";
import { AppError } from "@/server/errors";
import { supabaseConfig } from "@/lib/authConfig";
import { commentOnEvent } from "@/server/house/service";
import { houseEvent } from "../../../../../../../../shared/house";
import type { AppState } from "../../../../../../../../frontend/src/lib/types";

export const runtime = "nodejs";

/** Separate from all betting writes. Client-supplied facts/identity are ignored.
 * Membership is checked on EVERY request, including cached commentary.
 */
export async function POST(req: Request, ctx: { params: Promise<{ seriesId: string; betId: string }> }) {
  const { seriesId, betId } = await ctx.params;
  const response = await seriesAction(req, async ({ rpc }) => {
    const state = await rpc("my_series_state") as AppState;
    const series = state.series.find((s) => s.id === seriesId);
    const bet = series?.bets.find((b) => b.id === betId);
    if (!series || !bet) throw new AppError(404, "bet_not_found", "That bet isn't available to you.");
    const event = houseEvent(series, bet);
    return event ? commentOnEvent(event, supabaseConfig()!.url) : null;
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
