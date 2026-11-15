import { z } from "zod";
import { Webhook } from "standardwebhooks";

const content = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(2000) }),
  z.object({ type: z.literal("attachment"), attachmentId: z.string().regex(/^pho_att_[a-z0-9]+$/) }),
]);
const received = z.object({
  id: z.string().min(1), type: z.literal("message.received"), apiVersion: z.literal("2026-07-01"), source: z.literal("imessage.photon"),
  data: z.object({ projectId: z.string(), object: z.object({
    id: z.string().min(1), projectId: z.string(), platform: z.literal("imessage"), status: z.literal("received"),
    sentBy: z.object({ id: z.string(), projectId: z.string(), platform: z.literal("imessage") }),
    receivedBy: z.object({ id: z.string(), projectId: z.string(), platform: z.literal("imessage") }).optional(),
    space: z.object({ id: z.string(), kind: z.literal("direct"), projectId: z.string(), platform: z.literal("imessage"), participantIds: z.array(z.string()) }),
    content: z.union([content, z.object({ type: z.literal("group"), parts: z.array(content).min(1).max(5) })]),
  }) }),
});

/** Fail closed on unknown versions/platforms. Only private conversations with this agent. */
export function inboundMessage(event: unknown, projectId: string, agentId: string) {
  const parsed = received.safeParse(event);
  if (!parsed.success) return null;
  const { data } = parsed.data;
  const m = data.object;
  if ([data.projectId, m.projectId, m.sentBy.projectId, m.space.projectId].some((id) => id !== projectId)) return null;
  if (m.receivedBy && (m.receivedBy.id !== agentId || m.receivedBy.projectId !== projectId)) return null;
  const people = new Set(m.space.participantIds);
  if (m.sentBy.id === agentId || people.size !== 2 || !people.has(agentId) || !people.has(m.sentBy.id)) return null;
  const parts = m.content.type === "group" ? m.content.parts : [m.content];
  const images = parts.filter((p) => p.type === "attachment");
  if (images.length > 1) return null;
  const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n");
  if (text.length > 2000) return null;
  return { eventId: parsed.data.id, messageId: m.id, senderId: m.sentBy.id, spaceId: m.space.id, text: images.length ? text : conversationalCommand(text), attachmentId: images[0]?.attachmentId ?? null };
}

export function verifyEvent(raw: string, headers: Headers, secret: string): unknown {
  return new Webhook(secret).verify(raw, {
    "webhook-id": headers.get("webhook-id") ?? "",
    "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
    "webhook-signature": headers.get("webhook-signature") ?? "",
  });
}

/** Fast exact intent aliases. Evidence captions stay unchanged; no model latency. */
export function conversationalCommand(text: string) {
  const normalized = text.toLowerCase().trim().replace(/[?.!]+$/, "").replace(/’/g, "'");
  if (/^(results|standings|show (my |the )?(results|standings)|who'?s winning|who is winning|how am i doing)$/.test(normalized)) return "RESULTS";
  if (/^(bets|my bets|show (my |the )?bets|send proof|submit proof)$/.test(normalized)) return "BETS";
  if (/^(stop|pause alerts|stop alerts)$/.test(normalized)) return "STOP";
  if (/^(start|resume alerts|start alerts)$/.test(normalized)) return "START";
  if (/^(help|hi|hello|what can you do)$/.test(normalized)) return "HELP";
  return text;
}
