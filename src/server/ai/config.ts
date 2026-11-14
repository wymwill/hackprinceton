import "server-only";

/**
 * Which AI Bookie runs.
 *
 * - "claude": calls Claude. The default when ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN is set.
 * - "off": no model. Odds come from stored history only, and evidence reviews list what was
 *   submitted and always hand the decision to a human.
 * - "stub": a deterministic stand-in for tests. Never use it for real bets.
 *
 * Override with BOOKIE_AI=claude|off|stub.
 */
export type AiMode = "claude" | "off" | "stub";

export function aiMode(): AiMode {
  const v = process.env.BOOKIE_AI;
  if (v === "claude" || v === "off" || v === "stub") return v;
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "claude" : "off";
}

export const AI_MODEL = process.env.BOOKIE_AI_MODEL ?? "claude-opus-5-5";

export const aiStatus = () => {
  const mode = aiMode();
  return { mode, model: mode === "claude" ? AI_MODEL : undefined };
};
