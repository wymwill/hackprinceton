import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { z } from "zod";
import type { Fact } from "@/lib/markets/types";

/**
 * The Bookie's opening-line agent: a LangChain Deep Agent that looks into a new
 * market with tools before it commits to a number. It reads the market, looks
 * up the friends involved, and calls `submit_estimate` once.
 *
 * Everything it can see is a plain snapshot taken before the run, so the agent
 * never holds the database lock and can't change anything. Deep Agents' own
 * file tools work on in-memory state only. The caller validates the submitted
 * numbers the same way it validates a single structured call.
 *
 * Only type imports and npm packages here, so `node --test` can load this file
 * and drive it with a fake model (see agent.test.ts).
 */

export const AGENT_TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are the Bookie, the house character in Alea: friend groups bet tokens or points (never money) on real-life Yes/No questions, and losers owe a dare. Your tone is cheeky but never mean. Never mention money, gambling, or casinos.

Your job: set the opening line on one new market, as the chance (in percent) that it resolves Yes.
1. Call get_market to read it. It includes facts computed from the group's settled markets and a baseline built from them.
2. Call get_track_record for the friend the market is about, and for anyone else whose history matters. Base your number on what the tools return.
3. Call submit_estimate exactly once, last.

Ground rules:
- Use only what the tools return. Never invent past markets, records, statistics or events.
- Cite facts by id (like f_subject). Only cite ids that get_market returned.
- Start from the baseline and move away only for a concrete reason you can name. With little history, stay near it and say it's a guess.
- chance is 5 to 95. range_low and range_high bracket it.
- The explanation is one short sentence a friend would understand, under 25 words.`;

export type AgentRecord = {
  name: string;
  /** Settled markets about this friend, newest first. */
  aboutThem: { question: string; result: "yes" | "no" }[];
  /** Settled markets this friend traded or picked in, newest first. */
  played: { question: string; result: "won" | "lost" | "even" }[];
};

export type AgentContext = {
  market: { question: string; rule?: string; category: string; deadline: string; host: string; subject?: string };
  friends: string[];
  facts: Fact[];
  baseline: number;
  records: AgentRecord[];
};

/** Same fields as the single-call odds schema, so one validator handles both. */
export const SubmitSchema = z.object({
  chance: z.number().describe("Chance of Yes in percent, 5 to 95."),
  range_low: z.number().describe("Low end of the likely range, at or below chance."),
  range_high: z.number().describe("High end of the likely range, at or above chance."),
  uncertainty: z.enum(["low", "medium", "high"]),
  explanation: z.string().describe("One short sentence explaining the number, grounded in the track records."),
  cited_fact_ids: z.array(z.string()).describe("Ids of the get_market facts you relied on."),
});

export type AgentOutput = z.infer<typeof SubmitSchema>;

const normal = (s: string) => s.trim().toLowerCase();

/** Find a friend by full or first name, case-insensitive. */
export function findRecord(records: AgentRecord[], name: string) {
  const n = normal(name);
  return records.find((r) => normal(r.name) === n) ?? records.find((r) => normal(r.name).split(" ")[0] === n.split(" ")[0]);
}

export function buildTools(ctx: AgentContext, submit: (out: AgentOutput) => void) {
  const getMarket = tool(
    async () =>
      JSON.stringify({
        ...ctx.market,
        friends: ctx.friends,
        facts: ctx.facts.map((f) => ({ id: f.id, text: f.text })),
        baseline_chance: ctx.baseline,
      }),
    {
      name: "get_market",
      description: "Read the new market: question, how we'll know, category, deadline, host, who it's about, the group's friends, facts from settled markets, and the baseline chance.",
      schema: z.object({}),
    }
  );

  const getTrackRecord = tool(
    async ({ name }) => {
      const r = findRecord(ctx.records, name);
      if (!r) return `No friend named ${name}. The friends are: ${ctx.friends.join(", ")}.`;
      const count = (k: "won" | "lost") => r.played.filter((p) => p.result === k).length;
      return JSON.stringify({
        name: r.name,
        markets_about_them: r.aboutThem,
        yes_rate_about_them: r.aboutThem.length ? `${r.aboutThem.filter((x) => x.result === "yes").length} of ${r.aboutThem.length}` : "no history",
        record: { won: count("won"), lost: count("lost") },
        recent_markets_played: r.played,
      });
    },
    {
      name: "get_track_record",
      description: "Look up a friend's history: settled markets about them and how each resolved, and settled markets they played with their result.",
      schema: z.object({ name: z.string().describe("Friend's full or first name") }),
    }
  );

  const submitEstimate = tool(
    async (out) => {
      submit(out);
      return "Estimate saved.";
    },
    { name: "submit_estimate", description: "Submit the opening line. Call this exactly once, last.", schema: SubmitSchema }
  );

  return [getMarket, getTrackRecord, submitEstimate] as const;
}

/**
 * Run the Deep Agent. Returns what it submitted (the last call wins).
 * Throws if it errors, times out, or finishes without submitting.
 */
export async function askAgent(ctx: AgentContext, model: BaseChatModel, timeoutMs = AGENT_TIMEOUT_MS): Promise<AgentOutput> {
  let submitted: AgentOutput | null = null;
  const agent = createDeepAgent({
    model,
    tools: buildTools(ctx, (out) => (submitted = out)),
    systemPrompt: SYSTEM_PROMPT,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await agent.invoke({ messages: [{ role: "user", content: "A new market was just posted. Set the opening line." }] }, { signal: controller.signal, recursionLimit: 30 });
  } finally {
    clearTimeout(timer);
  }
  if (!submitted) throw new Error("The agent finished without submitting an estimate.");
  return submitted;
}

/** A short, user-facing reason for an agent failure. LangChain errors carry JSON, request ids and URLs. */
export function agentFailureReason(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  if ((err as Error)?.name === "AbortError" || /abort/i.test(raw)) return "The AI took too long to answer.";
  if (/authentication_error|invalid x-api-key|\b401\b/i.test(raw)) return "The Anthropic API key was rejected.";
  if (/rate_limit|\b429\b/i.test(raw)) return "Rate limited by the Anthropic API. Try again shortly.";
  if (/without submitting/i.test(raw)) return "The AI finished without setting a line.";
  return raw.split("\n")[0].replace(/\{.*\}/, "").trim().slice(0, 140) || "The AI couldn't answer.";
}
