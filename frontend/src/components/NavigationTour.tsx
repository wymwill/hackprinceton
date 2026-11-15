import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { TOUR_STEPS } from "../../../shared/navigationTour.ts";
import { useStore } from "../lib/store.tsx";
import { useCredits } from "../lib/credits.ts";

const TourContext = createContext({ start: () => {} });
export const useTour = () => useContext(TourContext);
const COPY = [
  { title: "Your home base", text: "Home brings your series, open predictions, and next moves together. Play with virtual coins; the bottom players owe a punishment." },
  { title: "Start a game", text: "New series lets you pick a quick game or write your own predictions. Set the rules in the lobby before betting starts." },
  { title: "Join your friends", text: "Have an invite? Use Join with a code to enter a friend's series. You can explore the platform during this tour—nothing is submitted for you." },
  { title: "Keep the group together", text: "Groups gives your friends a shared place to chat and start series." },
  { title: "Find your people", text: "Add friends here and invite them to play. When betting opens, pick an outcome and a coin amount. Winners split the pool in proportion to their stakes." },
  { title: "Make it yours", text: "Profile is where you choose your picture, manage reminders, and see your credits. Tutorial credits become extra starting coins in your next series." },
  { title: "Help is always here", text: "Use this question mark to replay the tour whenever you like. Completing it earns 200 credits once per account; replays are always free." },
];
type Box = { top: number; left: number; width: number; height: number };

/** No backdrop, focus trap, automatic navigation, or clicks on the player's behalf. */
export function NavigationTourProvider({ children }: { children: ReactNode }) {
  const { me, toast } = useStore();
  const { data, failed, finishTour } = useCredits();
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const claiming = useRef(false);
  const seenKey = `bookie:tour-seen:${me}`;
  const start = useCallback(() => {
    try { localStorage.setItem(seenKey, "1"); } catch { /* Still works without storage. */ }
    setError("");
    setStep(0);
  }, [seenKey]);

  // Opens once for a new player. An account that finished the tour never sees it again; if
  // credits can't load (a database without them), this device's memory decides instead.
  useEffect(() => {
    if (data?.tutorialDoneAt || (!data && !failed)) return;
    try { if (localStorage.getItem(seenKey)) return; } catch { return; }
    start();
  }, [data, failed, seenKey, start]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("tour") !== "1") return;
    start();
    params.delete("tour");
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
  }, [location, navigate, start]);

  useLayoutEffect(() => {
    if (step === null) return;
    let frame = 0;
    let target: Element | null = null;
    let firstMeasurement = true;
    const observer = new ResizeObserver(() => schedule());
    const update = () => {
      frame = 0;
      const modalOpen = !!document.querySelector('.modal, [role="dialog"][aria-modal="true"]');
      setPaused(modalOpen);
      let found = document.querySelector(`[data-tour="${TOUR_STEPS[step]}"]`);
      // On phones the menu may be folded away: point at its button until it's opened.
      if (found && !found.getClientRects().length) found = document.querySelector(".menu-toggle") ?? found;
      if (found !== target) {
        observer.disconnect();
        target = found;
        if (target) observer.observe(target);
      }
      if (firstMeasurement && !modalOpen && target) {
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        firstMeasurement = false;
      }
      const r = target?.getBoundingClientRect();
      setBox(!modalOpen && r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
        ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    const mutations = new MutationObserver(schedule);
    // Class changes too, so opening the phone menu moves the highlight onto the item.
    mutations.observe(document.getElementById("root")!, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".modal")) setStep(null); };
    window.addEventListener("keydown", escape);
    return () => {
      observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("keydown", escape);
    };
  }, [step, location.pathname]);

  const complete = async () => {
    if (claiming.current) return;
    if (data?.tutorialDoneAt) { setStep(null); toast("Tour complete. You've already earned your tutorial credits."); return; }
    claiming.current = true;
    setBusy(true); setError("");
    try {
      const result = await finishTour();
      setStep(null);
      toast(result.awarded ? `+${result.awarded} credits! They'll be added when your next series starts.` : "Tour complete. You've already earned your tutorial credits.");
    } catch {
      setError("Couldn't save your completion. Try again to collect your credits.");
    } finally { claiming.current = false; setBusy(false); }
  };

  const active = step !== null && !paused;
  // Place the card at the opposite end of the screen from the highlighted control.
  const cardAtTop = box && box.top > window.innerHeight / 2;
  return <TourContext.Provider value={{ start }}>
    {children}
    {active && createPortal(<div className="navigation-tour">
      {box && <div className="tour-highlight" aria-hidden="true" style={{ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 }} />}
      <section className={`tour-card ${cardAtTop ? "at-top" : ""}`} role="region" aria-label="Bookie navigation tutorial">
        <div className="row between"><span className="cap">Quick tour · {step + 1} of {COPY.length}</span><button type="button" className="tour-close" aria-label="Close tutorial" onClick={() => setStep(null)}>×</button></div>
        <div aria-live="polite" aria-atomic="true"><h2>{COPY[step].title}</h2><p>{COPY[step].text}</p></div>
        <p className="tour-hint">Keep exploring. Skip or press Esc to close.</p>
        {error && <p role="alert" className="tour-error">{error}</p>}
        <div className="row between">
          <button type="button" className="btn ghost sm" onClick={() => setStep(null)}>Skip tour</button>
          <div className="row">
            {step > 0 && <button type="button" className="btn sm" disabled={busy} onClick={() => { setError(""); setStep(step - 1); }}>Back</button>}
            <button type="button" className="btn primary sm" disabled={busy} onClick={() => step === COPY.length - 1 ? void complete() : setStep(step + 1)}>
              {busy ? "Saving…" : step === COPY.length - 1 ? data?.tutorialDoneAt ? "Finish tour" : "Finish · +200 credits" : "Next"}
            </button>
          </div>
        </div>
      </section>
    </div>, document.body)}
  </TourContext.Provider>;
}
