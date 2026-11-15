import type { NextRequest } from "next/server";
import { seriesAction } from "@/server/seriesApi";

const flag = (v: unknown) => (typeof v === "boolean" ? v : null);

/** Turn reminder kinds on or off. Body: { closingBets?, unresolvedResults?, punishmentPicks? } (booleans; others unchanged). */
export async function PATCH(req: NextRequest) {
  return seriesAction(req, ({ body, rpc }) =>
    rpc("set_notification_prefs", {
      p_closing_bets: flag(body.closingBets),
      p_unresolved_results: flag(body.unresolvedResults),
      p_punishment_picks: flag(body.punishmentPicks),
    })
  );
}
