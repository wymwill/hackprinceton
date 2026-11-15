/**
 * Bookie on iMessage (and WhatsApp / Telegram / a terminal), through Photon Spectrum.
 *
 *   npm run agent
 *
 * Players text Bookie's number: "bets", "bet 50 on yes #1", "board", "coins", or
 * "link CODE" (from Profile → Text Bookie in the app). Every reply shows a typing
 * indicator while Bookie works and marks the message read straight away, so it
 * feels like texting a friend. Setup: docs/imessage-agent.md.
 */
import { Spectrum, type Message, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { parse, respond, type Options } from "./brain.ts";
import { connect } from "./bookie.ts";
import { makeInterpreter } from "./llm.ts";

const need = (name: string, ...alts: string[]) => {
  const v = [name, ...alts].map((n) => process.env[n]).find(Boolean);
  if (!v) {
    console.error(`Missing ${name}. See docs/imessage-agent.md.`);
    process.exit(1);
  }
  return v;
};

const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
// With Photon keys: iMessage (your Photon line). Without: a local terminal chat, for trying it out.
const wanted = (process.env.BOOKIE_AGENT_PROVIDERS ?? (projectId && projectSecret ? "imessage" : "terminal")).split(",").map((s) => s.trim());
const providers = wanted.map((p) => {
  if (p === "imessage") return imessage.config();
  if (p === "terminal") return terminal.config();
  console.error(`Unknown provider "${p}". Use imessage or terminal.`);
  process.exit(1);
});

const bookieFor = connect({
  url: need("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  key: need("SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  secret: need("BOOKIE_AGENT_SECRET"),
});
const options: Options = { appUrl: process.env.BOOKIE_APP_URL, interpret: makeInterpreter() };

const app = projectId && projectSecret ? await Spectrum({ projectId, projectSecret, providers }) : await Spectrum({ providers });
console.log(`Bookie agent is listening on ${wanted.join(" + ")}.${options.interpret ? " Free-form texts go to Gemini." : ""}`);

const isGroup = (space: Space) => (space as Space & { type?: string }).type === "group";

/** One sender's messages are answered in order; different senders don't wait for each other. */
const queues = new Map<string, Promise<void>>();
function inOrder(key: string, job: () => Promise<void>) {
  const next = (queues.get(key) ?? Promise.resolve()).then(job, job);
  queues.set(key, next);
  void next.finally(() => queues.get(key) === next && queues.delete(key));
}

async function answer(space: Space, message: Message, text: string) {
  const started = Date.now();
  const handle = `${message.platform}:${message.sender!.id}`;
  const group = isGroup(space);
  const intent = parse(text, group);
  if (!intent) return; // group chatter that isn't for Bookie
  // Seen right away, typing while it works: the two signals that make a reply feel live.
  if (message.platform !== "terminal") void message.read().catch(() => {});
  await space.responding(async () => {
    let reply: string;
    try {
      reply = await respond(intent, bookieFor(handle, message.id), options);
    } catch (err) {
      console.error(`[${handle}] ${intent.kind} failed:`, err);
      reply = "Bookie hit a snag on that one. Give it a second and try again.";
    }
    // In a group, reply to the message so it's clear who Bookie is answering.
    await (group ? message.reply(reply) : space.send(reply));
  });
  console.log(`[${message.platform}] ${intent.kind} answered in ${Date.now() - started}ms`);
}

const stop = async () => {
  await app.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for await (const [space, message] of app.messages) {
  if (message.direction !== "inbound" || !message.sender || message.content.type !== "text") continue;
  const text = message.content.text;
  inOrder(`${space.id}:${message.sender.id}`, () => answer(space, message, text));
}
