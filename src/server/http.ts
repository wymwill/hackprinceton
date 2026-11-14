import "server-only";
import { after, type NextRequest } from "next/server";
import { runQueued } from "./ai/bookie";
import { AppError } from "./errors";
import { transact, type Db } from "./store";

export const USER_COOKIE = "bwf_user";

/**
 * Who is making the request. There is no login: the header's "Playing as"
 * switcher sets this cookie. Without it, you're the first user in the data.
 */
export function cookieUserId(req: NextRequest) {
  return req.cookies.get(USER_COOKIE)?.value;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** The cookie's user if they exist, otherwise the first user (there is no login). */
export const resolveUser = (db: Db, id: string | undefined) => (id && db.users.some((u) => u.id === id) ? id : db.users[0]?.id ?? "");

/** Run a mutation for the current user. Any AI work it queued runs after the response. */
export async function mutate<T>(req: NextRequest, fn: (db: Db, userId: string) => T, status = 200) {
  const cookie = cookieUserId(req);
  try {
    const result = await transact((db) => fn(db, resolveUser(db, cookie)));
    after(runQueued);
    return Response.json({ result }, { status });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Read with the current user resolved. Also drains queued AI work. */
export async function query<T>(req: NextRequest, fn: (db: Db, userId: string) => T) {
  const cookie = cookieUserId(req);
  try {
    const result = await transact((db) => fn(db, resolveUser(db, cookie)));
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

/** Read the current user's id outside a transaction (for AI routes that manage their own). */
export async function currentUser(req: NextRequest) {
  const cookie = cookieUserId(req);
  return transact((db) => resolveUser(db, cookie));
}
