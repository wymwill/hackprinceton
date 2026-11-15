import { useCallback, useEffect, useState } from "react";
import { TOUR_STEPS } from "../../../shared/navigationTour.ts";
import { request } from "./store.tsx";

export type Credits = { credits: number; tutorialDoneAt: string | null };

/** Tells every useCredits() on the page to reload after a change. */
const EVENT = "alea-credits";

/** Your tutorial credits. They become extra starting coins in the next series you play that starts. */
export function useCredits() {
  const [data, setData] = useState<Credits | null>(null);
  // True once loading has failed, so callers can tell "not loaded yet" from "not available".
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await request<Credits>("GET", "/rewards"));
      setFailed(false);
    } catch {
      // Older databases don't have credits yet; the app just doesn't show them.
      setData(null);
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);

  /** The database records the one-time reward, including across devices and replays. */
  const finishTour = async () => {
    const r = await request<Credits & { awarded: number }>("POST", "/rewards/tutorial", { completedSteps: [...TOUR_STEPS] });
    window.dispatchEvent(new Event(EVENT));
    return r;
  };
  return { data, failed, finishTour, reload: load };
}
