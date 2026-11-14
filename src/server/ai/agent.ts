import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { z } from "zod";
import { normalizeChances } from "@/lib/bets/odds";
import type { Fact } from "@/lib/bets/types";
import { snapshot } from "../bets";
import type { Db } from "../store";
import { AI_MODEL } from "./config";

/**
 * The AI Bookie's opening-line agent: a LangChain Deep Agent that researches a
 * new bet with tools before committing to numbers. It reads the bet, looks up
 * friends' track records, and calls `submit_line` once.
 *
 * Runs after the create response is sent (see `setOpeningLine` in ./bookie.ts),
 * which saves the line and records it as the bet's first Claude estimate.
 */

const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are the Bookie for a friend group's no-money betting app. Friends bet points on real-life claims (gym streaks, wake-up times, movie picks, side projects). Losers owe a dare.

Your job: set the opening line on one new bet.
1. Call get_bet to read it. It includes facts computed from the group's settled bets and a statistical baseline built from them.
2. Call get_track_record for each friend the bet is about (and the creator if relevant). Base your numbers on their actual history, not vibes.
3. Call submit_line exactly once with a chance for every outcome (whole numbers that add up to 100), a one-sentence take explaining the numbers, and a short roast.

Only use numbers and history that the tools return. Never invent past bets or records. If there is little history, stay near the baseline and say so.

Tone: cheeky and playful, never mean. No money talk. Keep the take under 25 words and the roast under 15 words.`;

export type AgentContext = {
  db: Db;
  betId: string;
  /** Stored-history facts and baseline from the odds model, so the agent starts from the same data. */
  facts: Fact[];
  baseline: { outcomeId: string; p: number }[];
};

export type AgentLine = { chances: number[]; take: string; roast: string; model: string };

/** Find a friend by full or first name, case-insensitive. */
function findUser(db: Db, name: string) {
  const n = name.trim().toLowerCase();
  return db.users.find((u) => u.name.toLowerCase() === n || u.name.toLowerCase().split(" ")[0] === n.split(" ")[0]);
}

function buildTools({ db, betId, facts, baseline }: AgentContext, submit: (line: { chances: number[]; take: string; roast: string }) => void) {
  const state = snapshot(db, "alex");
  const bet = state.bets.find((b) => b.id === betId);

  const getBet = tool(
    async () => {
      if (!bet) return "Bet not found.";
      const creator = state.users.find((u) => u.id === bet.creatorId)?.name;
      const subject = state.users.find((u) => u.id === bet.subjectId)?.name;
      return JSON.stringify({
        proposition: bet.proposition,
        category: bet.category,
        outcomes: bet.outcomes.map((o) => o.label),
        deadline: bet.deadline,
        creator,
        on_the_hook: subject ?? null,
        dare: bet.dare,
        friends: state.users.map((u) => u.name),
        history_facts: facts.map((f) => f.text),
        baseline_chances: bet.outcomes.map((o) => Math.round((baseline.find((b) => b.outcomeId === o.id)?.p ?? 0) * 100)),
      });
    },
    {
      name: "get_bet",
      description: "Read the new bet: proposition, outcomes, deadline, creator, who's on the hook, the group's friends, facts from settled bets, and a baseline.",
      schema: z.object({}),
    }
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
      const onTheHook = state.bets
        .filter((b) => b.receipt && b.subjectId === u.id && b.outcomes.length === 2)
        .slice(0, 10)
        .map((b) => ({ bet: b.proposition, result: b.outcomes.find((o) => o.id === b.receipt!.outcomeId)?.label }));
      return JSON.stringify({ name: u.name, title: u.title, ...view.stats, recentBets: recent, betsAboutThem: onTheHook });
    },
    {
      name: "get_track_record",
      description:
        "Look up a friend's history: wins, losses, current streak, net points, recent settled bets they joined, and settled bets where they were on the hook.",
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

/** Run the Deep Agent. Throws if it errors, times out, or finishes without submitting. */
export async function askAgent(ctx: AgentContext): Promise<AgentLine> {
  let submitted: { chances: number[]; take: string; roast: string } | null = null;
  const agent = createDeepAgent({
    model: new ChatAnthropic({ model: AI_MODEL, maxTokens: 8000, outputConfig: { effort: "low" } }),
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
  return { chances: normalizeChances(line.chances), take: line.take.slice(0, 200), roast: line.roast.slice(0, 120), model: AI_MODEL };
}
