import "server-only";
import { AppError } from "./errors";

/** The request body as an object, or {} when it's missing or not JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** A JSON error the client can show: { error: { code, message } }. */
export function errorResponse(err: unknown) {
  if (err instanceof AppError) return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  console.error(err);
  return Response.json({ error: { code: "internal", message: "Something went wrong. Try again." } }, { status: 500 });
}
