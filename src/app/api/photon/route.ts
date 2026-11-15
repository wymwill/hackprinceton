import { seriesAction } from "@/server/seriesApi";
import { photonConfig, requirePhoton } from "@/server/photon/service";
export async function GET(req: Request) {
  return seriesAction(req, async ({ rpc }) => {
    const c = photonConfig();
    if (!c) return { configured: false, connected: false };
    return { configured: true, address: c.address, ...await rpc("photon_status") as object };
  });
}
export async function DELETE(req: Request) {
  return seriesAction(req, async ({ rpc }) => { requirePhoton(); return rpc("photon_disconnect"); });
}
