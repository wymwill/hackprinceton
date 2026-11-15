import { useCallback, useEffect, useState } from "react";
import { request } from "./store.tsx";

export type Credits = { credits: number; tutorialDoneAt: string | null };
export type QuizAnswers = { payout?: string; rules?: string; bottom?: string };

/** Tells every useCredits() on the page to reload after a change. */
const EVENT = "alea-credits";

/** Your tutorial credits. They become extra starting coins in the next series you play that starts. */
export function useCredits() {
  const [data, setData] = useState<Credits | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await request<Credits>("GET", "/rewards"));
    } catch {
      // Older databases don't have credits yet; the app just doesn't show them.
      setData(null);
    }
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(EVENT, load);
    return () => window.removeEventListener(EVENT, load);
  }, [load]);

  /** Grade the quiz on the server; the first correct finish gives 200 credits. */
  const finish = async (answers: QuizAnswers) => {
    const r = await request<Credits & { awarded: number }>("POST", "/rewards/tutorial", { answers });
    window.dispatchEvent(new Event(EVENT));
    return r;
  };
  return { data, finish, reload: load };
}
