import { timingSafeEqual } from "node:crypto";
import { flushPhoton } from "@/server/photon/service";
import { errorResponse } from "@/server/http";
export const maxDuration = 30;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const wanted = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  if (!secret || wanted.length !== got.length || !timingSafeEqual(wanted, got)) return new Response(null, { status: 401 });
  try { await flushPhoton(); return Response.json({ ok: true }); } catch (err) { return errorResponse(err); }
}
