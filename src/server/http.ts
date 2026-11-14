import "server-only";
import { after, type NextRequest } from "next/server";
import { runQueued } from "./ai/bookie";
import { identify, userFor } from "./auth";
import { AppError } from "./errors";
import { transact, type Db } from "./store";

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** Run a mutation for the signed-in user. Any AI work it queued runs after the response. */
export async function mutate<T>(req: NextRequest, fn: (db: Db, userId: string) => T, status = 200) {
  try {
    const who = await identify(req);
    const result = await transact((db) => fn(db, userFor(db, who)));
    after(runQueued);
    return Response.json({ result }, { status });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Read as the signed-in user. Also drains queued AI work. */
export async function query<T>(req: NextRequest, fn: (db: Db, userId: string) => T) {
  try {
    const who = await identify(req);
    const result = await transact((db) => fn(db, userFor(db, who)));
    after(runQueued);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  console.error(err);
  return Response.json({ error: { code: "internal", message: "Something went wrong. Try again." } }, { status: 500 });
}

/** The signed-in user's id outside a transaction (for AI routes that manage their own). Throws 401 when signed out. */
export async function currentUser(req: NextRequest) {
  const who = await identify(req);
  return transact((db) => userFor(db, who));
}
