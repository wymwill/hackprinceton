import assert from "node:assert/strict";
import test from "node:test";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { agentFailureReason, askAgent, buildTools, findRecord, type AgentContext, type AgentOutput } from "./agent.ts";

/**
 * Runs the real Deep Agent loop with a scripted model instead of Claude, so the
 * tools, the submit path and the failure path are checked without an API key.
 */

const ctx: AgentContext = {
  market: { question: "Will Jake make 6 AM leg day on Thursday?", category: "fitness", deadline: "2026-11-20T11:00:00.000Z", host: "Sam Lee", subject: "Jake Cho" },
  friends: ["Sam Lee", "Jake Cho", "Priya Shah"],
  facts: [{ id: "f_subject", text: "Jake is 2 for 7 on fitness markets.", marketIds: ["m_1", "m_2"] }],
  baseline: 31,
  records: [
    { name: "Jake Cho", aboutThem: [{ question: "Will Jake run Saturday?", result: "no" }], played: [{ question: "Will Priya ship?", result: "lost" }] },
    { name: "Sam Lee", aboutThem: [], played: [] },
  ],
};

const estimate: AgentOutput = { chance: 24, range_low: 15, range_high: 35, uncertainty: "medium", explanation: "Jake skips early workouts.", cited_fact_ids: ["f_subject"] };

const call = (name: string, args: Record<string, unknown>, id: string) => new AIMessage({ content: "", tool_calls: [{ id, name, args, type: "tool_call" }] });

/** A chat model that replays `responses` in order, one per turn, and records what it was sent. */
class Scripted extends BaseChatModel {
  seen: BaseMessage[][] = [];
  responses: AIMessage[];
  constructor(responses: AIMessage[]) {
    super({});
    this.responses = responses;
  }
  _llmType() {
    return "scripted";
  }
  // The agent binds its tools to the model. The script already knows which to call.
  bindTools() {
    return this;
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages);
    const message = this.responses.shift() ?? new AIMessage("Out of script.");
    return { generations: [{ text: typeof message.content === "string" ? message.content : "", message }] };
  }
}

function scripted(responses: AIMessage[]) {
  const model = new Scripted(responses);
  return { model, seen: model.seen };
}

test("the agent reads the market, checks a record, and returns what it submitted", async () => {
  const { model, seen } = scripted([
    call("get_market", {}, "c1"),
    call("get_track_record", { name: "Jake" }, "c2"),
    call("submit_estimate", estimate, "c3"),
    new AIMessage("Line set."),
  ]);
  const out = await askAgent(ctx, model, 10_000);
  assert.deepEqual(out, estimate);

  const toolText = seen.at(-1)!.filter((m) => m.getType() === "tool").map((m) => String(m.content));
  assert.ok(toolText.some((t) => t.includes("f_subject") && t.includes('"baseline_chance":31')), "get_market returns the facts and baseline");
  assert.ok(toolText.some((t) => t.includes("Jake Cho") && t.includes("Will Jake run Saturday?")), "get_track_record finds Jake by first name");
  assert.ok(toolText.includes("Estimate saved."));
});

test("the agent throws if it finishes without submitting", async () => {
  const { model } = scripted([call("get_market", {}, "c1"), new AIMessage("I'd rather not say.")]);
  await assert.rejects(askAgent(ctx, model, 10_000), /without submitting/);
});

test("get_track_record names the friends when the name is unknown", async () => {
  const [, getTrackRecord] = buildTools(ctx, () => {});
  const res = String(await getTrackRecord.invoke({ name: "Zed" }));
  assert.match(res, /No friend named Zed/);
  assert.match(res, /Priya Shah/);
});

test("findRecord matches full names before first names", () => {
  assert.equal(findRecord(ctx.records, "jake cho")?.name, "Jake Cho");
  assert.equal(findRecord(ctx.records, "Sam")?.name, "Sam Lee");
  assert.equal(findRecord(ctx.records, "Nobody"), undefined);
});

test("failure reasons are short and plain", () => {
  const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
  assert.equal(agentFailureReason(abort), "The AI took too long to answer.");
  assert.equal(agentFailureReason(new Error('401 {"type":"authentication_error"}')), "The Anthropic API key was rejected.");
  assert.equal(agentFailureReason(new Error("429 rate_limit_error")), "Rate limited by the Anthropic API. Try again shortly.");
});
