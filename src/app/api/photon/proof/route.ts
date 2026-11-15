import { seriesAction, check } from "@/server/seriesApi";
import { photonFetch, requirePhoton } from "@/server/photon/service";
import { AppError } from "@/server/errors";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function GET(req: Request) {
  return seriesAction(req, async ({ from }) => {
    const betId = new URL(req.url).searchParams.get("betId") ?? "";
    if (!UUID.test(betId)) throw new AppError(400,"invalid_bet","Choose a bet.");
    requirePhoton();
    return check(await from("photon_proofs").select("id,bet_id,user_id,body,attachment_id,created_at").eq("bet_id",betId).order("created_at",{ascending:false}).limit(30));
  });
}
export async function POST(req: Request) {
  return seriesAction(req, async ({ from,body }) => {
    if (typeof body.id !== "string" || !UUID.test(body.id)) throw new AppError(404,"not_found","Proof not found.");
    // RLS requires current series membership before we use the server's Photon key.
    const row = check(await from("photon_proofs").select("attachment_id").eq("id",body.id).maybeSingle()) as { attachment_id: string | null } | null;
    if (!row?.attachment_id) throw new AppError(404,"not_found","Image not found.");
    const res = await photonFetch(`/attachments/${encodeURIComponent(row.attachment_id)}/content`);
    if (!res.ok) throw new AppError(503,"image_unavailable","Image unavailable. Try again.");
    const mime = res.headers.get("content-type")?.split(";")[0];
    if (!mime || !['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'].includes(mime)) throw new AppError(415,"unsupported_image","This image format isn't supported.");
    const reader = res.body?.getReader();
    if (!reader) throw new AppError(503,"image_unavailable","Image unavailable.");
    const chunks: Uint8Array[] = []; let size=0;
    while (true) {
      const {done,value}=await reader.read(); if(done) break;
      size+=value.byteLength;
      if(size>10000000) { await reader.cancel(); throw new AppError(413,"image_too_large","Image too large."); }
      chunks.push(value);
    }
    return { image: `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}` };
  });
}
