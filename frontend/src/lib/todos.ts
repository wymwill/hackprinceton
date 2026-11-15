/**
 * "Your moves": what the signed-in player can do right now, across every series
 * they're in. Worked out from the same state the screens already poll, so it
 * updates as friends move. Each item links to the screen where you do it.
 */
import { agreesTo, isParticipant } from "./rules.ts";
import { fmt, punishmentCopy } from "./format.ts";
import type { Id, Series } from "./types.ts";
import { deadlineText } from "./deadlines.ts";

export type Todo = {
  key: string;
  seriesId: Id;
  seriesName: string;
  /** What to do, starting with a verb. */
  text: string;
  /** Extra context: the bet, the punishment, who you're waiting on. */
  detail?: string;
  to: string;
  /** "now": you can do it right now. "waiting": nothing to do until someone else moves. */
  kind: "now" | "waiting";
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function seriesTodos(s: Series, me: Id, name: (id: Id) => string): Todo[] {
  const out: Todo[] = [];
  const home = `/s/${s.id}`;
  const add = (key: string, text: string, detail?: string, to = home, kind: Todo["kind"] = "now") =>
    out.push({ key: `${s.id}:${key}`, seriesId: s.id, seriesName: s.name, text, detail: detail && punishmentCopy(detail), to, kind });
  const isHost = s.hostId === me;
  const playing = isParticipant(s, me);
  const member = s.members.find((m) => m.userId === me);
  const { mode, betCount, betCreation } = s.settings;

  if (s.status === "lobby") {
    const mine = s.favors.filter((f) => f.authorId === me);
    if (playing && mode !== "money" && mine.length === 0) {
      add("favor", mode === "pledge" ? "Pledge your punishment" : "Add a punishment to the pool", "Needed before betting starts.");
    }
    if (playing && mode === "pool") {
      const unagreed = s.favors.filter((f) => !agreesTo(f, me));
      if (unagreed.length) add("agree", `Review ${plural(unagreed.length, "punishment")} in the pool`, unagreed.map((f) => f.text).join(" · "));
    }
    if (playing && member && !member.ready && (mode === "money" || mine.length > 0)) {
      add("ready", "Read the rules and mark yourself ready");
    }
    if (isHost) {
      if (s.bets.length < betCount && (betCreation === "upfront" || s.bets.length === 0)) {
        add("write", `Write ${plural(betCount - s.bets.length, "more bet")}`, `${s.bets.length} of ${betCount} written${betCreation === "upfront" ? "; all are needed before start" : ""}.`);
      }
      if (s.blockers.length === 0) add("start", "Start betting", "Everyone's ready.");
      else add("blocked", "Waiting to start", s.blockers[0], home, "waiting");
    } else if (playing && member?.ready) {
      add("wait-start", `Waiting for ${name(s.hostId)} to start`, s.blockers[0], home, "waiting");
    }
  }

  if (s.status === "active") {
    if (playing) {
      // Bets with a closing time first, soonest first.
      const unbet = s.bets
        .filter((b) => b.status === "open" && !b.wagers.some((w) => w.userId === me))
        .sort((a, b) => (a.closesAt ? Date.parse(a.closesAt) : Infinity) - (b.closesAt ? Date.parse(b.closesAt) : Infinity));
      for (const b of unbet) add(`bet:${b.id}`, "Place a bet", b.closesAt ? `${b.question} · closes ${deadlineText(b.closesAt)}` : b.question, `${home}/bets/${b.id}`);
    }
    if (isHost) {
      for (const b of s.bets.filter((x) => x.status === "closed")) {
        add(`call:${b.id}`, "Call the result", b.question, `${home}/bets/${b.id}`);
      }
      const unsettled = s.bets.some((b) => b.status === "open" || b.status === "closed");
      if (betCreation === "during" && s.bets.length < betCount) {
        add("next", "Write the next bet", `${s.bets.length} of ${betCount} written.`);
      } else if (!unsettled) {
        add("end", "End the series", "Every bet is settled.");
      }
    }
  }

  if (s.status === "assigning" || s.status === "finished") {
    const list = s.assignments;
    const nextUp = s.settings.exclusivePool ? list.find((a) => a.status === "picking") : undefined;
    for (const a of list) {
      const needsPick = a.status === "picking" || a.status === "declined";
      if (mode === "pool" && a.chooserId === me && needsPick) {
        const myTurn = !nextUp || nextUp.loserId === a.loserId || a.status === "declined";
        if (myTurn) add(`pick:${a.id}`, `Pick a punishment for ${name(a.loserId)}`, "You finished ahead of them.");
        else add(`pick:${a.id}`, `Pick a punishment for ${name(a.loserId)}`, `${name(nextUp!.chooserId!)} picks first.`, home, "waiting");
      }
      if (a.loserId === me && !a.done) {
        if (mode === "money") add(`owe:${a.id}`, `Pay your $${fmt(s.settings.minContribution)}`, "Recorded only; nothing is charged in the app.", home, "waiting");
        else if (a.text) add(`do:${a.id}`, "Do your punishment, then mark it done", a.text);
        else add(`await:${a.id}`, "Waiting for your punishment to be picked", a.chooserId ? `${name(a.chooserId)} picks it.` : undefined, home, "waiting");
      }
    }
  }

  return out;
}

/** Everything you can do now first, then what you're waiting on; most urgent series first. */
export function todos(series: Series[], me: Id, name: (id: Id) => string): Todo[] {
  const rank: Record<Series["status"], number> = { active: 0, assigning: 1, lobby: 2, finished: 3 };
  const ordered = [...series].sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
  const all = ordered.flatMap((s) => seriesTodos(s, me, name));
  return [...all.filter((t) => t.kind === "now"), ...all.filter((t) => t.kind === "waiting")];
}
