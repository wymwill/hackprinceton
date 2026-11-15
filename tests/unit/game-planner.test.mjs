import { test } from "node:test";
import assert from "node:assert/strict";
import { AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { GamePlannerInput, validateGamePlan } from "../../shared/gamePlan.ts";
import { generateGamePlan } from "../../src/server/planner/agent.ts";
import { createPlannerLimiter } from "../../src/server/planner/limits.ts";

const input = { prompt: "A weekend game for four roommates", players: 4, questionCount: 3 };
const plan = { name: "Roommate weekend", description: "Three predictions for our weekend together.", questions: ["Will we cook a meal together this weekend?", "Will anyone win two games in a row this weekend?", "Will we finish a movie together this weekend?"], punishments: ["Choose the next playlist", "Draw a mascot for the group"] };
const call = (name, args) => JSON.stringify({ content: "", tool_calls: [{ id: `call-${name}`, name, args, type: "tool_call" }] });
class ScriptedModel extends FakeListChatModel {
  seen = [];
  bindTools() { return this; }
  _formatGeneration(text) { return { message: new AIMessage(JSON.parse(text)), text: "" }; }
  async _generate(messages, options, manager) { this.seen.push(...messages.filter((m) => m.getType() === "tool").map((m) => m.name)); return super._generate(messages, options, manager); }
}

test("the real Deep Agents graph calls planning tools and produces a validated draft", async () => {
  const model = new ScriptedModel({ responses: [call("get_game_templates", { theme: "roommates" }), call("validate_game_plan", { plan, questionCount: 3 }), call("game_plan", plan)] });
  assert.deepEqual(await generateGamePlan(input, { model }), plan);
  assert.ok(model.seen.includes("get_game_templates"));
  assert.ok(model.seen.includes("validate_game_plan"));
});

test("invalid prompts, extra fields, duplicate questions and wrong counts are rejected", () => {
  assert.equal(GamePlannerInput.safeParse({ ...input, prompt: "short" }).success, false);
  assert.equal(GamePlannerInput.safeParse({ ...input, players: 1 }).success, false);
  assert.equal(GamePlannerInput.safeParse({ ...input, questionCount: 99 }).success, false);
  assert.equal(GamePlannerInput.safeParse({ ...input, userId: "somebody-else" }).success, false);
  assert.throws(() => validateGamePlan({ ...plan, questions: [plan.questions[0], plan.questions[0], plan.questions[2]] }, 3));
  assert.throws(() => validateGamePlan(plan, 4));
  assert.throws(() => validateGamePlan({ ...plan, settings: { startingCoins: 999999 } }, 3));
});

test("invalid agent output is refused instead of overwriting the user's draft", async () => {
  const model = new ScriptedModel({ responses: [call("game_plan", { ...plan, questions: ["Too few?"] })] });
  await assert.rejects(generateGamePlan(input, { model }), (e) => e.code === "planner_failed");
});

test("missing configuration explains how to continue without the planner", async () => {
  await assert.rejects(generateGamePlan(input, { apiKey: "" }), (e) => e.status === 503 && /Quick game/.test(e.message));
});

test("canceled runs stop and return a bounded timeout error", async () => {
  const controller = new AbortController(); controller.abort();
  const model = new ScriptedModel({ responses: [call("game_plan", plan)] });
  await assert.rejects(generateGamePlan(input, { model, signal: controller.signal }), (e) => e.code === "planner_timeout");
});

test("generation limits reject concurrent runs, release failures, and reset after a minute", async () => {
  let time = 0;
  const limit = createPlannerLimiter(() => time);
  let release;
  const pending = limit("ana", () => new Promise((resolve) => { release = resolve; }));
  await assert.rejects(limit("ana", async () => plan), (e) => e.status === 429);
  assert.deepEqual(await limit("ben", async () => plan), plan);
  release(plan); await pending;
  await assert.rejects(limit("ana", async () => { throw new Error("failed"); }));
  assert.deepEqual(await limit("ana", async () => plan), plan);
  await assert.rejects(limit("ana", async () => plan), (e) => e.status === 429);
  time = 60_001;
  assert.deepEqual(await limit("ana", async () => plan), plan);
});
