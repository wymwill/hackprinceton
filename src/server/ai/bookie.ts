import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { z } from "zod";
import type { BookieLine } from "@/lib/bets/types";
import { snapshot } from "../bets";
import { read, transact, type Db } from "../store";

/**
 * The AI Bookie: a LangChain Deep Agent that sets the opening line on a new bet.
 *
 * Flow: the bet is saved first and marked "thinking", the API responds right
 * away, and this runs afterwards. The agent looks up the bet and the friends'
 * track records with tools, then calls `submit_line`. Whatever it submits is
 * written onto the bet, and the screens pick it up on their next poll.
 *
 * If there's no API key, the agent errors, or it takes too long, a simple
 * track-record formula fills in, so a demo never hangs on the AI.
 */

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are the Bookie for a friend group's no-money betting app. Friends bet points on real-life claims (gym streaks, wake-up times, movie picks, side projects). Losers owe a dare.

Your job: set the opening line on one new bet.
1. Call get_bet to read it.
2. Call get_track_record for each friend the bet is about (and the creator if relevant). Base your numbers on their actual history, not vibes.
3. Call submit_line exactly once with a chance for every outcome (whole numbers that add up to 100), a one-sentence take explaining the numbers, and a short roast.

Tone: cheeky and playful, never mean. No money talk. Keep the take under 25 words and the roast under 15 words.`;

type Ctx = { db: Db; betId: string };

/** Find a friend by full or first name, case-insensitive. */
function findUser(db: Db, name: string) {
  const n = name.trim().toLowerCase();
  return db.users.find((u) => u.name.toLowerCase() === n || u.name.toLowerCase().split(" ")[0] === n.split(" ")[0]);
}

function buildTools({ db, betId }: Ctx, submit: (line: { chances: number[]; take: string; roast: string }) => void) {
  const state = snapshot(db, "alex");
  const bet = state.bets.find((b) => b.id === betId);

  const getBet = tool(
    async () => {
      if (!bet) return "Bet not found.";
      const creator = state.users.find((u) => u.id === bet.creatorId)?.name;
      return JSON.stringify({
        proposition: bet.proposition,
        category: bet.category,
        outcomes: bet.outcomes.map((o) => o.label),
        deadline: bet.deadline,
        creator,
        dare: bet.dare,
        friends: state.users.map((u) => u.name),
      });
    },
    { name: "get_bet", description: "Read the new bet: proposition, outcomes, deadline, creator, and the group's friends.", schema: z.object({}) }
  );

  const getTrackRecord = tool(
    async ({ name }) => {
      const u = findUser(db, name);
      if (!u) return `No friend named ${name}.`;
      const view = state.users.find((x) => x.id === u.id)!;
      const recent = state.bets
        .filter((b) => b.receipt && b.entries.some((e) => e.userId === u.id))
        .slice(0, 8)
        .map((b) => {
          const p = b.receipt!.payouts.find((x) => x.userId === u.id);
          return { bet: b.proposition, result: p && p.net >= 0 ? "won" : "lost" };
        });
      return JSON.stringify({ name: u.name, title: u.title, ...view.stats, recentBets: recent });
    },
    {
      name: "get_track_record",
      description: "Look up a friend's betting history: wins, losses, current streak, net points, and recent settled bets.",
      schema: z.object({ name: z.string().describe("Friend's full or first name") }),
    }
  );

  const submitLine = tool(
    async ({ chances, take, roast }) => {
      if (!bet) return "Bet not found.";
      if (chances.length !== bet.outcomes.length) return `Give exactly ${bet.outcomes.length} chances, one per outcome, in order.`;
      submit({ chances, take, roast });
      return "Line saved.";
    },
    {
      name: "submit_line",
      description: "Submit the opening line. Call this exactly once, last.",
      schema: z.object({
        chances: z.array(z.number().int().min(1).max(99)).describe("Chance for each outcome in the same order as get_bet's outcomes. Should add up to 100."),
        take: z.string().describe("One sentence explaining the numbers, grounded in track records."),
        roast: z.string().describe("A short, playful roast. Never mean."),
      }),
    }
  );

  return [getBet, getTrackRecord, submitLine];
}

/** Scale to whole numbers that add up to exactly 100. */
function normalize(chances: number[]) {
  const total = chances.reduce((a, b) => a + b, 0) || 1;
  const scaled = chances.map((c) => Math.max(1, Math.round((c / total) * 100)));
  scaled[scaled.indexOf(Math.max(...scaled))] += 100 - scaled.reduce((a, b) => a + b, 0);
  return scaled;
}

async function askAgent(ctx: Ctx): Promise<BookieLine> {
  let submitted: { chances: number[]; take: string; roast: string } | null = null;
  const agent = createDeepAgent({
    model: new ChatAnthropic({ model: MODEL, maxTokens: 8000, outputConfig: { effort: "low" } }),
    tools: buildTools(ctx, (line) => (submitted = line)),
    systemPrompt: SYSTEM_PROMPT,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await agent.invoke(
      { messages: [{ role: "user", content: "A new bet was just posted. Set the opening line." }] },
      { signal: controller.signal, recursionLimit: 30 }
    );
  } finally {
    clearTimeout(timer);
  }
  if (!submitted) throw new Error("The agent finished without submitting a line.");
  const line = submitted as { chances: number[]; take: string; roast: string };
  return {
    status: "ready",
    source: "ai",
    chances: normalize(line.chances),
    take: line.take.slice(0, 200),
    roast: line.roast.slice(0, 120),
    model: MODEL,
    at: new Date().toISOString(),
  };
}

/** No-AI fallback: lean the first outcome toward the named friend's win rate. */
function formulaLine({ db, betId }: Ctx): BookieLine {
  const state = snapshot(db, "alex");
  const bet = state.bets.find((b) => b.id === betId)!;
  const mentioned = state.users.find((u) => bet.proposition.toLowerCase().includes(u.name.split(" ")[0].toLowerCase()));
  const n = bet.outcomes.length;
  let chances = Array(n).fill(100 / n);
  let take = "Even odds until someone gives me a track record to work with.";
  if (mentioned && n === 2 && mentioned.stats.settled > 0) {
    const rate = (mentioned.stats.wins + 1) / (mentioned.stats.settled + 2);
    const first = Math.min(85, Math.max(15, Math.round(rate * 100)));
    chances = [first, 100 - first];
    take = `${mentioned.name.split(" ")[0]} has won ${mentioned.stats.wins} of ${mentioned.stats.settled} bets, so that's my starting line.`;
  }
  return { status: "ready", source: "formula", chances: normalize(chances), take, at: new Date().toISOString() };
}

/** Run the agent for a bet and save its line. Never throws: falls back to the formula. */
export async function setOpeningLine(betId: string) {
  const db = await read((d) => structuredClone(d));
  const ctx = { db, betId };
  let line: BookieLine;
  if (!process.env.ANTHROPIC_API_KEY) {
    line = formulaLine(ctx);
  } else {
    try {
      line = await askAgent(ctx);
    } catch (err) {
      console.error("[bookie] agent failed, using formula:", err instanceof Error ? err.message : err);
      line = formulaLine(ctx);
    }
  }
  await transact((d) => {
    const bet = d.bets.find((b) => b.id === betId);
    if (bet) bet.bookie = line;
  });
}
