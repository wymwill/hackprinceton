import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { demoWrappedSummary, type WrappedMoment, type WrappedSummary } from "../../../shared/wrapped.ts";
import { houseFumbleQuip } from "../../../shared/house.ts";
import { fmt } from "../lib/format.ts";
import { request } from "../lib/store.tsx";
import { posterLines } from "../lib/poster.ts";
import { sharePng, svgToPng } from "../lib/shareImage.ts";
import "./Wrapped.css";

type Payload = { summary: WrappedSummary; verdict: { comment: string; source: "openai" | "fallback" | "mock" } };
const currency = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${fmt(Math.abs(n))}`;
const fallbackLines = [
  "The receipts are in. Your confidence is still under investigation.",
  "A year of predictions. The spreadsheet has requested a quiet weekend.",
  "Every result is recorded. The group chat is already drafting its response.",
];
const SLIDES = ["opening", "numbers", "personality", "best", "worst", "social", "timeline", "verdict", "legacy"];

export default function Wrapped({ forceDemo = false }: { forceDemo?: boolean }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const demo = forceDemo || new URLSearchParams(loc.search).get("demo") === "1";
  const year = new URLSearchParams(loc.search).has("year") ? Number(new URLSearchParams(loc.search).get("year")) : new Date().getUTCFullYear();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const summary = demo ? demoWrappedSummary(year) : payload?.summary;

  useEffect(() => {
    if (demo) return;
    let active = true;
    request<Payload>("GET", `/wrapped?year=${encodeURIComponent(String(year))}`)
      .then((result) => { if (active) setPayload(result); })
      .catch(() => { if (active) setError("We couldn't load your private recap. Try again in a moment."); });
    return () => { active = false; };
  }, [demo, year]);

  const go = useCallback((next: number) => setSlide(Math.max(0, Math.min(SLIDES.length - 1, next))), []);
  const step = useCallback((amount: number) => setSlide((current) => Math.max(0, Math.min(SLIDES.length - 1, current + amount))), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const interactive = target instanceof Element && !!target.closest("button, a, input, textarea, select, [contenteditable='true']");
      if (event.key === " " && interactive) return;
      if (event.key === "ArrowRight" || event.key === " ") { event.preventDefault(); step(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      if (event.key === "Home") go(0);
      if (event.key === "End") go(SLIDES.length - 1);
      if (event.key === "Escape") navigate("/profile");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, navigate, step]);

  async function exportCard(share: boolean) {
    if (!summary || busy) return;
    setBusy(true);
    try {
      const svg = shareSvg(summary, payload?.verdict?.comment ?? `${summary.archetype.title}. ${fallbackLines[summary.totalBets % fallbackLines.length]}`);
      const blob = await svgToPng(svg, 1080, 1920);
      await sharePng(blob, `alea-wrapped-${summary.year}.png`, { share, title: `Bookie Wrapped ${summary.year}`, text: `${summary.name}: ${summary.archetype.title}` });
    } catch {
      setError("Image export couldn't finish on this device. Try Download again.");
    } finally { setBusy(false); }
  }

  if (!demo && !summary) return <main className="wrapped wrapped-loading">
    <Link className="wrapped-exit" to="/profile" aria-label="Back to profile">×</Link>
    {error ? <div className="wrapped-load-message"><span>THE ARCHIVE IS STILL OPEN</span><h1>Your recap is taking a minute.</h1><p>{error}</p><button className="wrapped-button" onClick={() => window.location.reload()}>Try again</button></div> : <div className="wrapped-load-message"><span>ALEA WRAPPED · {year}</span><h1>Gathering the receipts…</h1><p>Only your own recorded bets. No invented odds, no balance guesses.</p><span className="wrapped-loader" aria-hidden="true">✳</span></div>}
  </main>;

  const item = SLIDES[slide];
  const verdict = payload?.verdict?.comment ?? (summary!.totalBets
    ? `${summary!.name}, ${summary!.totalBets} bets and ${currency(summary!.net)} net coins. ${summary!.archetype.subtitle} ${fallbackLines[summary!.totalBets % fallbackLines.length]}`
    : `${summary!.name}, the ledger is blank. Either excellent discipline or an extremely quiet group chat.`);

  return <main className={`wrapped wrapped-${item}`} onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }} onTouchEnd={(e) => {
    if (!touchStart.current) return; const dx = e.changedTouches[0].clientX - touchStart.current.x; const dy = e.changedTouches[0].clientY - touchStart.current.y; touchStart.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) step(dx < 0 ? 1 : -1);
  }}>
    <a className="wrapped-skip" href="#wrapped-story">Skip story</a>
    <header className="wrapped-chrome">
      <Link className="wrapped-brand" to="/profile" aria-label="Return to profile">ALEA<span>✳</span></Link>
      <span className="wrapped-year">{summary!.year} WRAPPED{summary!.demo && <b>DEMO MODE</b>}</span>
      <Link className="wrapped-exit" to="/profile" aria-label="Close Wrapped">×</Link>
    </header>
    <div className="wrapped-progress" aria-label={`Story slide ${slide + 1} of ${SLIDES.length}`}>
      {SLIDES.map((_, i) => <button key={i} aria-label={`Go to slide ${i + 1}`} aria-current={i === slide ? "step" : undefined} onClick={() => go(i)}><span style={{ transform: `scaleX(${i <= slide ? 1 : 0})` }} /></button>)}
    </div>

    <section className="wrapped-stage" id="wrapped-story" tabIndex={-1} aria-live="polite" aria-atomic="false">
      <article key={`${slide}-${summary!.year}`} className={`wrapped-scene scene-${item} theme-${summary!.archetype.color}`}>
        {item === "opening" && <>
          <div className="orbit orbit-a" /><div className="orbit orbit-b" />
          <span className="eyebrow">THE YEAR IN YOUR BETTING LORE</span>
          <p className="opening-kicker">THE NUMBERS<br />ARE IN.</p>
          <div className="opening-mark">✳</div>
          <h1>YOUR ALEA<br /><em>WRAPPED.</em></h1>
          <p className="opening-byline">{summary!.name}, every bet left a story.<br />Here are the receipts.</p>
          <div className="scene-foot"><span>01 / 09</span><span>SWIPE OR TAP TO BEGIN ↓</span></div>
        </>}
        {item === "numbers" && <>
          <span className="eyebrow">THE RECEIPTS · {summary!.year}</span>
          <h2>THE NUMBERS<br /><em>DON'T LIE.</em></h2>
          {summary!.totalBets ? <>
            <div className="number-hero"><strong><AnimatedNumber value={summary!.totalBets} /></strong><span>BETS PLACED</span></div>
            <p className="number-roast">{summary!.name}, that was {fmt(summary!.totalBets)} chances to be right. The group chat remembers every one.</p>
            <div className="stat-ribbon">
              <Stat value={fmt(summary!.totalWagered)} label="COINS WAGERED" />
              <Stat value={summary!.winRate === null ? "—" : `${Math.round(summary!.winRate * 100)}%`} label={`WIN RATE · ${summary!.eligible} ELIGIBLE`} />
              <Stat value={currency(summary!.net)} label="NET COINS · SETTLED" />
              <Stat value={`${summary!.bestStreak} / ${summary!.worstStreak}`} label="BEST / WORST STREAK" />
            </div>
          </> : <EmptyStory name={summary!.name} />}
          <Foot slide={2} />
        </>}
        {item === "personality" && <>
          <span className="eyebrow">YOUR BETTING PERSONALITY</span>
          <div className="personality-burst" aria-hidden="true">✳</div>
          <h2 className="archetype-title">{summary!.archetype.title}</h2>
          <p className="archetype-subtitle">“{summary!.archetype.subtitle}”</p>
          <p className="archetype-desc">{summary!.archetype.description}</p>
          <div className="proof-chip"><span>THE CASE FILE</span><b>{summary!.archetype.reason}</b></div>
          <Foot slide={3} />
        </>}
        {item === "best" && <MomentScene type="best" moment={summary!.best} demo={summary!.demo} />}
        {item === "worst" && <MomentScene type="worst" moment={summary!.worst} demo={summary!.demo} />}
        {item === "social" && <>
          <span className="eyebrow">THE AWARDS CEREMONY · FRIENDS</span>
          <h2>YOUR FRIENDS<br /><em>KNOW TOO MUCH.</em></h2>
          {summary!.social.nemesis || summary!.social.rideOrDie || summary!.social.opposite ? <div className="awards">
            {summary!.social.nemesis && <Award medal="⚔" label="YOUR NEMESIS" name={summary!.social.nemesis.name} detail={`Beat your net on ${summary!.social.nemesis.beaten} of ${summary!.social.nemesis.shared} shared settled bets.`} />}
            {summary!.social.rideOrDie && <Award medal="♡" label="RIDE OR DIE" name={summary!.social.rideOrDie.name} detail={`Picked the same outcome on ${summary!.social.rideOrDie.aligned} of ${summary!.social.rideOrDie.shared} shared settled bets.`} />}
            {summary!.social.opposite && <Award medal="↔" label="YOUR OPPOSITE" name={summary!.social.opposite.name} detail={`Disagreed with you on ${summary!.social.opposite.disagreed} of ${summary!.social.opposite.shared} shared settled bets.`} />}
          </div> : <div className="empty-award"><span>THE RIVALRY BOARD IS EMPTY</span><p>Five shared settled markets unlock the awards. Go make some history together.</p><Link to="/new" className="wrapped-inline-link">START A CHALLENGE ↗</Link></div>}
          <p className="social-note">Private to you · only shared settled markets · minimum 5 comparisons</p>
          <Foot slide={6} />
        </>}
        {item === "timeline" && <>
          <span className="eyebrow">THE YEAR, IN PLOT TWISTS</span>
          <h2>THE RISE.<br /><em>THE FALL.</em></h2>
          {summary!.timeline.length >= 3 ? <>
            <Timeline values={summary!.timeline.map((p) => p.cumulative)} />
            <div className="timeline-meta"><span><b>{summary!.timeline.length}</b> settled moments</span><span>FINAL · <b>{currency(summary!.timeline.at(-1)!.cumulative)}</b></span></div>
          <p className="timeline-caption">Timestamped settled results only. Ties use their actual recorded payout; refunds return to baseline.</p>
          </> : <div className="timeline-empty"><span>THE PLOT IS STILL DEVELOPING</span><p>{summary!.timeline.length ? "One or two settled markets make a very short story." : "A timeline appears after enough timestamped settlements. We won't manufacture the drama."}</p><div className="timeline-spark">↗</div></div>}
          <Foot slide={7} />
        </>}
        {item === "verdict" && <>
          <span className="eyebrow">THE HOUSE HAS REVIEWED THE FOOTAGE</span>
          <div className="house-seal">H</div>
          <h2>THE HOUSE'S<br /><em>FINAL VERDICT.</em></h2>
          <blockquote className="verdict-quote">“{verdict}”</blockquote>
          <div className="verdict-stats"><span>{summary!.archetype.title}</span><span>{summary!.totalBets} BETS</span><span>{currency(summary!.net)} NET</span></div>
          <span className="verdict-source">{payload?.verdict.source === "openai" ? "THE HOUSE · AI COMMENTARY" : "THE HOUSE · AUTO COMMENTARY"}</span>
          <Foot slide={8} />
        </>}
        {item === "legacy" && <>
          <span className="eyebrow">ALEA WRAPPED · {summary!.year}{summary!.demo ? " · DEMO MODE" : ""}</span>
          <div className="legacy-poster" id="wrapped-poster">
            <div className="poster-glow" />
            <div className="poster-brand">ALEA <span>✳</span> WRAPPED</div>
            <p className="poster-name">{summary!.name}</p>
            <h2 className="poster-archetype">{summary!.archetype.title}</h2>
            <div className="poster-stats"><Stat value={summary!.totalBets} label="BETS" /><Stat value={summary!.winRate === null ? "—" : `${Math.round(summary!.winRate * 100)}%`} label="WIN RATE" /><Stat value={fmt(summary!.totalWagered)} label="COINS IN PLAY" /><Stat value={currency(summary!.net)} label="NET" /></div>
            <div className="poster-moments"><span>BEST {summary!.best ? currency(summary!.best.net) : "—"}</span><span>FUMBLE {summary!.worst ? currency(summary!.worst.net) : "—"}</span></div>
            <p className="poster-quote">“{summary!.archetype.subtitle}”</p>
            <span className="poster-foot">EVERY BET LEFT A STORY.</span>
            {summary!.demo && <b className="poster-demo">FICTIONAL DEMO DATA</b>}
          </div>
          <div className="legacy-actions">
            <button className="wrapped-button wrapped-primary" onClick={() => exportCard(false)} disabled={busy}>{busy ? "Making card…" : "↓ Download share card"}</button>
            {typeof navigator !== "undefined" && !!navigator.share && <button className="wrapped-button" onClick={() => exportCard(true)} disabled={busy}>Share image ↗</button>}
            <Link to="/new" className="wrapped-button">Start another challenge ↗</Link>
          </div>
          {error && <p className="wrapped-error" role="status">{error}</p>}
          <button className="wrapped-replay" onClick={() => go(0)}>↺ REPLAY YOUR STORY</button>
          <Foot slide={9} />
        </>}
      </article>
    </section>

    <footer className="wrapped-controls">
      <button className="wrapped-control secondary" onClick={() => go(slide - 1)} disabled={slide === 0} aria-label="Previous slide">← <span>BACK</span></button>
      <span>{String(slide + 1).padStart(2, "0")} <i>/</i> {String(SLIDES.length).padStart(2, "0")}</span>
      {slide < SLIDES.length - 1 ? <button className="wrapped-control next" onClick={() => go(slide + 1)} aria-label="Next slide"><span>KEEP GOING</span> →</button> : <Link to="/profile" className="wrapped-control next"><span>BACK TO ALEA</span> ↗</Link>}
    </footer>
  </main>;
}

function Stat({ value, label }: { value: string | number; label: string }) { return <div className="wrapped-stat"><b>{typeof value === "number" ? <AnimatedNumber value={value} /> : value}</b><span>{label}</span></div>; }
function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !value) { setShown(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 720);
      const ease = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(value * ease));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <><span aria-hidden="true">{fmt(shown)}</span><span className="wrapped-sr-only">{fmt(value)}</span></>;
}
function Foot({ slide }: { slide: number }) { return <div className="scene-foot"><span>{String(slide).padStart(2, "0")} / 09</span><span>YOUR YEAR · YOUR RECEIPTS</span></div>; }
function EmptyStory({ name }: { name: string }) { return <div className="empty-story"><span>NO BETS. NO BAD CALLS.</span><p>{name}, your betting legacy is a blank page. Either incredible discipline or a very quiet group chat.</p><Link className="wrapped-inline-link" to="/new">PLACE THE FIRST BET ↗</Link></div>; }
function MomentScene({ type, moment, demo }: { type: "best" | "worst"; moment: WrappedMoment | null; demo: boolean }) {
  const good = type === "best";
  return <>
    <span className="eyebrow">{good ? "THE ONE THAT LANDED" : "A MOMENT OF REFLECTION"}</span>
    <h2>{good ? <>YOUR MAGNUM<br /><em>OPUS.</em></> : <>WE NEED TO<br /><em>TALK ABOUT THIS.</em></>}</h2>
    {moment ? <div className={`moment-card ${good ? "moment-good" : "moment-bad"}`}>
      <span className="moment-result">{good ? "THE GREATEST VICTORY" : "THE GREATEST FUMBLE"}</span>
      <h3>{moment.question}</h3>
      <p>You backed <b>{moment.outcome}</b> with <b>{fmt(moment.stake)} coins</b>. {good ? "A rare prediction with excellent timing." : "The conviction was real. The result had other plans."}</p>
      <div className="moment-numbers"><Stat value={fmt(moment.stake)} label="STAKE" /><Stat value={fmt(moment.payout)} label="PAYOUT" /><Stat value={currency(moment.net)} label="NET" /></div>
      {!good && <div className="moment-house"><span>THE HOUSE, IN REVIEW</span><p>“{houseFumbleQuip(moment.betId)}”</p></div>}
      {!demo && <Link className="moment-link" to={`/s/${encodeURIComponent(moment.seriesId)}/bets/${encodeURIComponent(moment.betId)}`}>REVISIT THIS MARKET ↗</Link>}
      {demo && <span className="demo-stamp">FICTIONAL DEMO MARKET</span>}
    </div> : <div className="moment-empty"><span>{good ? "THE FIRST WIN IS STILL OUT THERE" : "NO FUMBLES ON FILE"}</span><p>{good ? "A greatest victory appears after a profitable eligible settlement." : "We're not inventing a disaster. No eligible losing settlement is recorded."}</p><Link className="wrapped-inline-link" to="/new">MAKE SOME HISTORY ↗</Link></div>}
    <Foot slide={good ? 4 : 5} />
  </>;
}
function Award({ medal, label, name, detail }: { medal: string; label: string; name: string; detail: string }) { return <div className="wrapped-award"><span className="award-medal">{medal}</span><div><span>{label}</span><b>{name}</b><p>{detail}</p></div></div>; }
function Timeline({ values }: { values: number[] }) {
  const width = 800, height = 300, pad = 30, low = Math.min(0, ...values), high = Math.max(0, ...values), span = high - low || 1;
  const points = values.map((n, i) => `${pad + i * (width - pad * 2) / Math.max(1, values.length - 1)},${height - pad - (n - low) * (height - pad * 2) / span}`).join(" ");
  const zero = height - pad - (0 - low) * (height - pad * 2) / span;
  return <svg className="wrapped-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Cumulative settled profit and loss, from ${fmt(values[0])} to ${fmt(values.at(-1)!)}`}><defs><linearGradient id="wrapped-line" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#ff7a4e"/><stop offset="1" stopColor="#ffd76e"/></linearGradient></defs><line x1={pad} x2={width - pad} y1={zero} y2={zero} className="chart-zero"/><polyline points={points} fill="none" stroke="url(#wrapped-line)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/><circle cx={width - pad} cy={Number(points.split(" ").at(-1)?.split(",")[1])} r="13" className="chart-end"/></svg>;
}
const escapeSvg = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
function shareSvg(s: WrappedSummary, quote: string) {
  const cleanName = s.name.replace(/[\p{Cc}\p{Cf}]/gu, "");
  const name = escapeSvg(cleanName.length > 24 ? `${cleanName.slice(0, 23)}…` : cleanName), title = escapeSvg(s.archetype.title), sub = escapeSvg(s.archetype.subtitle);
  const lines = posterLines(quote);
  // The quote marks go inside the first and last lines: a tspan's x would otherwise draw the first line over the opening mark.
  const q = lines.map((line, i) => `<tspan x="112" dy="${i ? 48 : 0}">${escapeSvg(line)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#131326"/><stop offset=".52" stop-color="#432a69"/><stop offset="1" stop-color="#ee6b55"/></linearGradient><radialGradient id="glow"><stop stop-color="#ffd66b" stop-opacity=".8"/><stop offset="1" stop-color="#ffd66b" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="1920" fill="url(#bg)"/><circle cx="900" cy="360" r="520" fill="url(#glow)"/><circle cx="90" cy="1250" r="480" fill="#6d50aa" opacity=".24"/><text x="96" y="140" fill="#fff" font-family="Arial,sans-serif" font-size="34" font-weight="700" letter-spacing="8">ALEA ✳ WRAPPED · ${s.year}${s.demo ? " · DEMO" : ""}</text><text x="92" y="390" fill="#fff" font-family="Arial,sans-serif" font-size="78" font-weight="800">${name}</text><text x="92" y="530" fill="#ffd66b" font-family="Arial,sans-serif" font-size="60" font-weight="900">${title}</text><text x="96" y="600" fill="#fff" opacity=".8" font-family="Arial,sans-serif" font-size="34">${sub}</text><rect x="72" y="720" width="936" height="680" rx="40" fill="#fff" opacity=".11" stroke="#fff" stroke-opacity=".2"/><text x="116" y="830" fill="#fff" opacity=".7" font-family="Arial,sans-serif" font-size="26" letter-spacing="5">THE RECEIPTS</text><text x="116" y="970" fill="#fff" font-family="Arial,sans-serif" font-size="100" font-weight="800">${s.totalBets}</text><text x="116" y="1015" fill="#fff" opacity=".7" font-family="Arial,sans-serif" font-size="24">BETS</text><text x="565" y="970" fill="#fff" font-family="Arial,sans-serif" font-size="100" font-weight="800">${s.winRate === null ? "—" : Math.round(s.winRate * 100) + "%"}</text><text x="565" y="1015" fill="#fff" opacity=".7" font-family="Arial,sans-serif" font-size="24">WIN RATE</text><text x="116" y="1170" fill="#fff" font-family="Arial,sans-serif" font-size="64" font-weight="800">${fmt(s.totalWagered)}</text><text x="116" y="1215" fill="#fff" opacity=".7" font-family="Arial,sans-serif" font-size="24">COINS WAGERED</text><text x="565" y="1170" fill="#fff" font-family="Arial,sans-serif" font-size="64" font-weight="800">${currency(s.net)}</text><text x="565" y="1215" fill="#fff" opacity=".7" font-family="Arial,sans-serif" font-size="24">NET VIRTUAL COINS</text><text x="112" y="1535" fill="#fff" font-family="Arial,sans-serif" font-size="34" font-style="italic">${q}</text><text x="96" y="1790" fill="#fff" opacity=".8" font-family="Arial,sans-serif" font-size="28" letter-spacing="4">EVERY BET LEFT A STORY.</text></svg>`;
}
