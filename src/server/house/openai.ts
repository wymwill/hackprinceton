import "server-only";
import { houseChoices, type HouseEvent } from "../../../shared/house.ts";

type Options = { apiKey: string; model?: string; fetcher?: typeof fetch; timeoutMs?: number };

/** A single, bounded Responses API request. No tools, no betting client, no user
 * text, no conversation history. Strict enum output is validated again locally.
 * Facts are composed in house.ts, so even hostile model output cannot invent one.
 */
export async function openAIChoice(event: HouseEvent, options: Options): Promise<string> {
  const choices = houseChoices(event);
  const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 3500),
    body: JSON.stringify({
      model: options.model ?? "gpt-4.1-mini",
      store: false,
      max_output_tokens: 160,
      instructions: "You are The House, a witty, playful sports commentator. Select the best fitting supplied punchline for the verified betting event. Roast decisions, never people or personal traits. Occasionally choose the enthusiastic or neutral line. Output only a quipId from the supplied choices. Never invent odds, history, relationships or results. No tools or actions are available.",
      input: JSON.stringify({ event: event.kind, flavor: event.flavor, facts: event.signals, choices }),
      text: { format: {
        type: "json_schema", name: "house_commentary", strict: true,
        schema: { type: "object", properties: { quipId: { type: "string", enum: choices.map((q) => q.id) } }, required: ["quipId"], additionalProperties: false },
      } },
    }),
  });
  if (!response.ok) throw new Error("Commentary provider unavailable"); // Never log provider bodies or credentials.
  const result = await response.json();
  if (result.status !== "completed" || !Array.isArray(result.output)) throw new Error("Incomplete commentary");
  const content = result.output.filter((item: { type?: string }) => item.type === "message").flatMap((item: { content?: unknown[] }) => item.content ?? []);
  if (content.length !== 1 || content[0]?.type !== "output_text" || typeof content[0].text !== "string" || content[0].text.length > 200) throw new Error("Invalid commentary");
  const parsed = JSON.parse(content[0].text);
  if (!parsed || Object.keys(parsed).length !== 1 || !choices.some((q) => q.id === parsed.quipId)) throw new Error("Invalid commentary choice");
  return parsed.quipId;
}
