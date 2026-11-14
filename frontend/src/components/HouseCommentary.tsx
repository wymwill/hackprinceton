import { useEffect, useState } from "react";
import { houseComment, houseEvent, type HouseComment } from "../../../shared/house.ts";
import { houseClient } from "../lib/house-client.ts";
import { request, useStore } from "../lib/store.tsx";
import type { Bet, Series } from "../lib/types.ts";
import "./HouseCommentary.css";

const EVENT_LABELS = { bet_placed: "Bet placed", bet_resolved: "Bet resolved", upset: "Upset" };

/** Isolated from the wager form: initial rendering and betting never await AI. */
export function HouseCommentary({ series, bet }: { series: Series; bet: Bet }) {
  const { me } = useStore();
  const event = houseEvent(series, bet);
  // Key the stateful child to the account AND event: late responses cannot bleed
  // across navigation/account changes, and dismissed cards stay dismissed on reload.
  return event ? <HouseEventCard key={`${me}:${event.id}`} userId={me} event={event} /> : null;
}

function HouseEventCard({ userId, event }: { userId: string; event: NonNullable<ReturnType<typeof houseEvent>> }) {
  const preferenceKey = `alea-house-hidden:${userId}`;
  const dismissKey = `alea-house-dismiss:${userId}:${event.betId}`;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(preferenceKey) === "true"; } catch { return false; }
  });
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(dismissKey) === event.id; } catch { return false; }
  });
  const [choice, setChoice] = useState<Pick<HouseComment, "quipId" | "source"> | null>(null);
  const { id, seriesId, betId } = event;

  useEffect(() => {
    if (hidden || dismissed) return;
    let active = true;
    houseClient()(userId, event, () => request<HouseComment | null>("POST", `/series/${encodeURIComponent(seriesId)}/bets/${encodeURIComponent(betId)}/commentary`))
      .then((result) => { if (active) setChoice({ quipId: result.quipId, source: result.source }); });
    return () => { active = false; };
    // Same event gets one request; ordinary polling changes object identity only.
    // The displayed factual sentence is always recomputed from the current snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, id, seriesId, betId, hidden, dismissed]);

  function hide(value: boolean) {
    setHidden(value);
    try { localStorage.setItem(preferenceKey, String(value)); } catch { /* Optional preference. */ }
  }
  if (hidden || dismissed) return <div className="house-muted">
    <span>The House is {hidden ? "off" : "quiet for this event"}.</span>
    <button type="button" className="btn ghost sm" onClick={() => {
      hide(false); setDismissed(false);
      try { sessionStorage.removeItem(dismissKey); } catch { /* Optional preference. */ }
    }}>Show commentary</button>
  </div>;

  const comment = houseComment(event, choice?.quipId, choice?.source);
  return <aside className={`house-card ${event.kind === "upset" ? "house-upset" : ""}`} aria-label="The House commentary">
    <div className="house-top">
      <div className="house-identity"><span className="house-mark" aria-hidden="true">H</span><strong>The House</strong><span className="house-source">{comment.source === "openai" ? "AI commentary" : "Auto commentary"}</span></div>
      <div className="house-actions">
        <button type="button" onClick={() => {
          setDismissed(true);
          try { sessionStorage.setItem(dismissKey, event.id); } catch { /* Optional preference. */ }
        }} aria-label="Dismiss this House comment">Dismiss</button>
        <button type="button" onClick={() => hide(true)} aria-label="Turn off The House commentary">Turn off</button>
      </div>
    </div>
    <div className="house-event"><span aria-hidden="true">●</span> {EVENT_LABELS[event.kind]}</div>
    <p aria-live="polite" aria-atomic="true">{comment.comment}</p>
  </aside>;
}
