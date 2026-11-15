import type { NextRequest } from "next/server";
import { AppError } from "@/server/errors";
import { seriesAction } from "@/server/seriesApi";
import { providersForClient } from "@/server/links";

/**
 * Every app you can link (and whether it's set up here), plus the ones you've linked.
 * Before the linked-accounts migration is applied, still lists the apps, with a note.
 */
export async function GET(req: NextRequest) {
  return seriesAction(req, async ({ rpc }) => {
    const providers = providersForClient();
    try {
      return { providers, linked: await rpc("link_status"), setupNeeded: null };
    } catch (err) {
      if (err instanceof AppError && err.code === "migrations_missing") return { providers, linked: [], setupNeeded: err.message };
      throw err;
    }
  });
}
