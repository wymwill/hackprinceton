/**
 * Optional: free-form texts ("put fifty on the knicks for the first one") → a Bookie
 * command, by Gemini. Used only when the plain parser can't tell, so most replies never
 * wait on a model. Off unless GOOGLE_API_KEY (or GEMINI_API_KEY) is set.
 */
import { ChatGoogle } from "@langchain/google/node";
import { z } from "zod";
import type { Intent } from "./brain.ts";

const Guess = z.object({
  kind: z.enum(["help", "bets", "board", "coins", "wager", "unlink", "unknown"]).describe("What the player wants"),
  amount: z.number().int().positive().nullable().describe("Coins to wager, for kind=wager"),
  all: z.boolean().nullable().describe("True if they want to wager all their free coins"),
  outcome: z.string().nullable().describe("The outcome they back, as they wrote it (yes, no, a name…), for kind=wager"),
  pick: z.number().int().positive().nullable().describe("The bet's number from the list, if they gave one"),
});

const SYSTEM = `You turn text messages to Bookie, a friends' betting game played with virtual coins, into one command.
Commands: help; bets (list open bets and odds); board (standings); coins (balance); unlink; wager (needs an amount or "all", and an outcome; pick is the bet number if mentioned).
Use unknown for anything else, including chit-chat. Never invent an amount or outcome the player didn't give.`;

export function makeInterpreter(): ((text: string) => Promise<Intent | null>) | undefined {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;
  const model = new ChatGoogle({
    apiKey,
    model: process.env.BOOKIE_AGENT_MODEL ?? process.env.GEMINI_PLANNER_MODEL ?? "gemini-3.5-flash-lite",
    maxRetries: 0,
    maxOutputTokens: 200,
    platformType: "gai",
  }).withStructuredOutput(Guess);

  return async (text) => {
    // Kept short so a confused text still gets an answer quickly.
    const g = await model.invoke(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: text.slice(0, 500) },
      ],
      { signal: AbortSignal.timeout(4000) }
    );
    if (g.kind === "wager") {
      if (!g.outcome || (!g.amount && !g.all)) return null;
      return { kind: "wager", amount: g.all ? "all" : g.amount!, outcome: g.outcome, pick: g.pick ?? undefined };
    }
    if (g.kind === "unknown") return null;
    return { kind: g.kind };
  };
}
