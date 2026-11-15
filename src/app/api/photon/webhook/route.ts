import { after } from "next/server";
import { inboundMessage, verifyEvent } from "@/server/photon/protocol";
import { photonDb, photonFetch, requirePhoton, safelyFlushPhoton } from "@/server/photon/service";
import { errorResponse } from "@/server/http";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    const c = requirePhoton();
    // Read with a hard limit even when Content-Length is absent.
    const reader = req.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(value);
    }
    let event: unknown;
    try { event = verifyEvent(Buffer.concat(chunks).toString("utf8"), req.headers, c.secret); }
    catch { return new Response(null, { status: 400 }); }
    const m = inboundMessage(event, c.projectId, c.agentId);
    if (!m) return new Response(null, { status: 204 });
    if (m.eventId !== req.headers.get("webhook-id")) return new Response(null, { status: 400 });
    // Store only images, never arbitrary files or externally supplied fetch URLs.
    if (m.attachmentId) {
      const response = await photonFetch(`/attachments/${encodeURIComponent(m.attachmentId)}`);
      if (!response.ok) return new Response(null, { status: 503 });
      const data = await response.json();
      const a = data.attachment ?? data;
      if (!['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'].includes(a.contentType) || !(a.sizeBytes > 0 && a.sizeBytes <= 10000000)) return new Response(null, { status: 204 });
    }
    const { error } = await photonDb().rpc("photon_receive", {
      p_project: c.projectId, p_sender: m.senderId, p_space: m.spaceId, p_message: m.messageId, p_text: m.text, p_attachment: m.attachmentId,
    });
    if (error) return new Response(null, { status: 503 });
    after(() => safelyFlushPhoton(m.spaceId));
    return new Response(null, { status: 204 });
  } catch (err) { return errorResponse(err); }
}
