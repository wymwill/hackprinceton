import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { seed } from "./engine.ts";
import type { Db } from "./types.ts";

/**
 * One JSON file on disk, kept in memory and written atomically (temp file + rename).
 * Every change goes through `transact`, which runs one at a time, works on a copy,
 * and only saves when the command finished without a rule error. So a failed
 * command never leaves half a change behind. Assumes a single server process.
 */
export function createStore(file: string) {
  let cache: Db | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  async function save(db: Db) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2));
    await rename(tmp, file);
  }

  async function load(): Promise<Db> {
    if (cache) return cache;
    try {
      const db = JSON.parse(await readFile(file, "utf8")) as Db;
      if (db?.version !== 1 || !Array.isArray(db.users) || !Array.isArray(db.series)) throw new Error(`Unrecognized data in ${file}`);
      cache = db;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      cache = seed();
      await save(cache);
    }
    return cache;
  }

  function transact<T>(fn: (db: Db) => T): Promise<T> {
    const run = chain.then(async () => {
      const current = await load();
      const draft = structuredClone(current);
      const out = fn(draft);
      if (JSON.stringify(draft) !== JSON.stringify(current)) {
        await save(draft);
        cache = draft;
      }
      return out;
    });
    chain = run.catch(() => undefined);
    return run;
  }

  async function reset() {
    return transact((db) => {
      const fresh = seed();
      db.users = fresh.users;
      db.series = fresh.series;
    });
  }

  return { transact, reset };
}

export type Store = ReturnType<typeof createStore>;
