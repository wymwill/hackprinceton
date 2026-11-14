import "server-only";
import type { NextRequest } from "next/server";
import { BetError, snapshot } from "./bets";
import { transact, type Db } from "./store";

export const USER_COOKIE = "bookie_user";
const DEFAULT_USER = "alex";

/**
 * Who is making the request. There is no login yet: the header's "Playing as"
 * switcher sets this cookie so several friends can be demoed from one browser.
 */
export function currentUserId(req: NextRequest) {
  return req.cookies.get(USER_COOKIE)?.value ?? DEFAULT_USER;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** Run a mutation for the current user and respond with its result plus fresh app state. */
export async function mutate<T>(req: NextRequest, fn: (db: Db, userId: string) => T, status = 200) {
  const userId = currentUserId(req);
  try {
    const out = await transact((db) => ({ result: fn(db, userId), state: snapshot(db, userId) }));
    return Response.json(out, { status });
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown) {
  if (err instanceof BetError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: { code: "internal", message: "Something went wrong. Try again." } }, { status: 500 });
}
