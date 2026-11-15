import { randomBytes, createHash } from "node:crypto";
import { seriesAction } from "@/server/seriesApi";
import { requirePhoton } from "@/server/photon/service";
export async function POST(req: Request) {
  return seriesAction(req, async ({ rpc }) => {
    const c = requirePhoton();
    const code = randomBytes(12).toString("hex");
    await rpc("photon_pair", { p_hash: createHash("sha256").update(code).digest("hex") });
    return { code, address: c.address, expiresAt: new Date(Date.now() + 600000).toISOString() };
  });
}
