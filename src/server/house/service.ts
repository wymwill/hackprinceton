import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fallbackChoice, houseChoices, houseComment, type HouseComment, type HouseEvent } from "../../../shared/house.ts";
import { openAIChoice } from "./openai.ts";

type Choice = { quipId: string; source: HouseComment["source"] };
type Options = { directory: string; namespace: string; now?: () => number; generate?: (event: HouseEvent) => Promise<string>; source?: "openai" | "mock" };
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const MINUTE_LIMIT = 10;
const DAY_LIMIT = 200;

/** Exclusive file creation is the claim, shared across processes on one disk.
 * Claim failures fail closed: no model call. Claims survive timeouts and restarts.
 */
async function claim(file: string, contents = "") {
  try { await writeFile(file, contents, { flag: "wx", mode: 0o600 }); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}
async function slot(directory: string, prefix: string, limit: number) {
  for (let i = 0; i < limit; i++) if (await claim(path.join(directory, `${prefix}-${i}`))) return true;
  return false;
}

export function createHouseService(options: Options) {
  const now = options.now ?? Date.now;
  return async (event: HouseEvent): Promise<HouseComment> => {
    const fallback = houseComment(event);
    if (!options.generate) return fallback;
    // Do not send historical events on every deployment, navigation or cache prune.
    const age = now() - Date.parse(event.at);
    const directory = path.join(options.directory, digest(options.namespace));
    const file = path.join(directory, `event-${digest(event.id)}.json`);
    try {
      const readChoice = async () => {
        const choice = JSON.parse(await readFile(file, "utf8")) as Choice;
        if (!["openai", "mock", "fallback"].includes(choice.source) || !houseChoices(event).some((q) => q.id === choice.quipId)) return fallback;
        return houseComment(event, choice.quipId, choice.source);
      };
      try { return await readChoice(); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return fallback;
      }
      if (!Number.isFinite(age) || age < -5000 || age > 120_000) return fallback;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      // Persist a usable fallback BEFORE a model call. A racing viewer may see it;
      // subsequent reads get the final choice, but no process ever retries this event.
      if (!await claim(file, JSON.stringify({ quipId: fallback.quipId, source: "fallback" }))) {
        try { return await readChoice(); } catch { return fallback; }
      }
      const time = now();
      const budgets = path.join(directory, `budget-${Math.floor(time / 86_400_000)}`);
      await mkdir(budgets, { recursive: true, mode: 0o700 });
      const betKey = digest(`${event.seriesId}/${event.betId}`);
      // Separate resolution budget: a recent wager must not silence the result.
      if (!await claim(path.join(budgets, `bet-${betKey}-${event.kind}-${Math.floor(time / 30_000)}`)) ||
          !await slot(budgets, `minute-${Math.floor(time / 60_000)}`, MINUTE_LIMIT) ||
          !await slot(budgets, "day", DAY_LIMIT)) return fallback;
      const quipId = await options.generate(event);
      const comment = houseComment(event, quipId, options.source ?? "openai");
      const temp = `${file}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify({ quipId: comment.quipId, source: comment.source }), { mode: 0o600 });
      await rename(temp, file);
      return comment;
    } catch {
      // Disk errors, refused/invalid output, network failures and timeouts are all
      // commentary-only failures. Never retry a paid call or touch betting state.
      return fallback;
    }
  };
}

export async function commentOnEvent(event: HouseEvent, namespace: string) {
  const mode = process.env.HOUSE_MODE ?? "auto";
  const apiKey = process.env.OPENAI_API_KEY;
  // Ephemeral deployments need a deliberate shared persistent mount before paid AI.
  const storageAllowed = !process.env.VERCEL || !!process.env.HOUSE_CACHE_DIR;
  const generate = mode === "mock" ? async (e: HouseEvent) => fallbackChoice(e)
    : mode === "auto" && apiKey && storageAllowed ? (e: HouseEvent) => openAIChoice(e, { apiKey, model: process.env.OPENAI_HOUSE_MODEL }) : undefined;
  return createHouseService({ directory: process.env.HOUSE_CACHE_DIR || path.join(process.cwd(), ".data", "house"), namespace, generate, source: mode === "mock" ? "mock" : "openai" })(event);
}
