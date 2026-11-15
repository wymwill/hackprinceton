import { z } from "zod";

export const GamePlannerInput = z.object({
  prompt: z.string().trim().min(12).max(1000),
  players: z.number().int().min(2).max(20),
  questionCount: z.number().int().min(3).max(8),
}).strict();

/** Generated content is data only. The app supplies settings and creates the lobby. */
export const GamePlanSchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().min(3).max(280),
  questions: z.array(z.string().trim().min(8).max(300)).min(3).max(8),
  punishments: z.array(z.string().trim().min(3).max(120)).min(1).max(5),
}).strict().meta({ title: "game_plan" });
export type GamePlannerInput = z.infer<typeof GamePlannerInput>;
export type GamePlan = z.infer<typeof GamePlanSchema>;

export function validateGamePlan(value: unknown, questionCount: number): GamePlan {
  const plan = GamePlanSchema.parse(value);
  if (plan.questions.length !== questionCount) throw new Error("Wrong number of predictions");
  if (new Set(plan.questions.map((q) => q.toLowerCase())).size !== plan.questions.length) throw new Error("Duplicate predictions");
  if (new Set(plan.punishments.map((p) => p.toLowerCase())).size !== plan.punishments.length) throw new Error("Duplicate punishments");
  return plan;
}
