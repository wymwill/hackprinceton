import { houseComment, type HouseComment, type HouseEvent } from "../../../shared/house.ts";

type StoredChoice = Pick<HouseComment, "quipId" | "source">;
type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Choices only, scoped by signed-in user; no names, market text, tokens or comments
 * in storage. A shared promise handles StrictMode, overlapping renders and tabs' reloads.
 */
export function createHouseClient(storage?: StorageLike) {
  const pending = new Map<string, Promise<StoredChoice>>();
  return async (userId: string, event: HouseEvent, load: () => Promise<HouseComment | null>) => {
    const bucket = `alea-house-v1:${userId}`;
    const key = `${bucket}:${event.id}`;
    const read = (): Record<string, StoredChoice> => {
      try {
        const value = JSON.parse(storage?.getItem(bucket) ?? "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
      } catch { return {}; }
    };
    const saved = read()[event.id];
    if (saved && ["openai", "fallback", "mock"].includes(saved.source)) return houseComment(event, saved.quipId, saved.source);
    let promise = pending.get(key);
    if (!promise) {
      promise = (async () => {
        let result = houseComment(event);
        try {
          const reply = await load();
          if (reply?.event.id === event.id) result = houseComment(event, reply.quipId, reply.source);
        } catch { /* Network failure is a usable local comment, never a betting toast. */ }
        const choice = { quipId: result.quipId, source: result.source };
        try {
          const records = Object.entries(read()).filter(([id]) => id !== event.id).slice(-99);
          storage?.setItem(bucket, JSON.stringify(Object.fromEntries([...records, [event.id, choice]])));
        } catch { /* Storage disabled/full: session memory still deduplicates. */ }
        return choice;
      })();
      pending.set(key, promise);
      // Bound memory even when storage is unavailable; older events still have the
      // server's persistent deduplication and fresh-event generation cutoff.
      if (pending.size > 200) pending.delete(pending.keys().next().value!);
    }
    const choice = await promise;
    return houseComment(event, choice.quipId, choice.source);
  };
}

let client: ReturnType<typeof createHouseClient> | undefined;
export function houseClient() {
  if (!client) {
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* Private browsing. */ }
    client = createHouseClient(storage);
  }
  return client;
}
