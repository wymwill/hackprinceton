import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AppError } from "../errors.ts";

export function photonConfig() {
  const apiKey = process.env.PHOTON_API_KEY;
  const projectId = process.env.PHOTON_PROJECT_ID;
  const agentId = process.env.PHOTON_AGENT_USER_ID;
  const secret = process.env.PHOTON_WEBHOOK_SECRET;
  const address = process.env.PHOTON_IMESSAGE_ADDRESS;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return apiKey && projectId && agentId && secret && address && url && serviceKey
    ? { apiKey, projectId, agentId, secret, address, url, serviceKey } : null;
}
export function requirePhoton() {
  const config = photonConfig();
  if (!config) throw new AppError(503, "photon_not_configured", "iMessage isn't set up on this server yet.");
  return config;
}
export function photonDb() {
  const c = requirePhoton();
  return createClient(c.url, c.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function photonFetch(path: string, init?: RequestInit) {
  const c = requirePhoton();
  return fetch(`https://api.photon.codes/v1/projects/${encodeURIComponent(c.projectId)}${path}`, {
    ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${c.apiKey}`, ...init?.headers },
  });
}

/** An accepted API send is queued at Photon; it is not a delivery receipt. */
export async function flushPhoton(spaceId?: string) {
  const c = photonConfig();
  if (!c) return;
  const db = photonDb();
  const { data, error } = await db.rpc("photon_claim", { p_project: c.projectId, ...(spaceId ? { p_space: spaceId } : {}) });
  if (error) throw new Error("Photon queue could not be read.");
  await Promise.all((data ?? []).map(async (row: { id: string; lease: string; space_id: string; body: string }) => {
    try {
      const response = await photonFetch("/messages", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `bookie:${row.id}` },
        body: JSON.stringify({ spaceId: row.space_id, senderId: c.agentId, content: { type: "text", format: "plain", text: row.body } }),
      });
      if (!response.ok) { console.error("Photon send failed", response.status); return; }
      const { error: ackError } = await db.rpc("photon_ack", { p_id: row.id, p_lease: row.lease });
      if (ackError) console.error("Photon acknowledgement failed");
    } catch { console.error("Photon send unavailable; retained for retry"); }
  }));
}
export async function safelyFlushPhoton(spaceId?: string) {
  try { await flushPhoton(spaceId); } catch { console.error("Photon queue unavailable; retry with the worker"); }
}
