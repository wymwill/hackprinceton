/**
 * Submitting something that must happen at most once (a wager, a new series).
 *
 * Each intended action gets a submission id. The server records it with the
 * result in the same transaction (migration 0017), so sending the same id again,
 * after a double tap, a timeout or a lost response, returns the original result
 * instead of doing it twice. Retries of an uncertain submission must reuse the id.
 */
/** The store's API call (passed in, so this module doesn't import the store). */
type Send = <T>(method: string, path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
/** Errors from Send carry the HTTP status (0 when the server couldn't be reached). */
type WithStatus = { status?: number; message?: string; code?: string };

/** How long to wait before treating a submission as "we don't know yet". */
const TIMEOUT_MS = 15_000;

export const newRequestId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

export type Submitted<T> =
  /** The server confirmed it. */
  | { kind: "done"; result: T }
  /** The server refused it (a 4xx): nothing was changed. */
  | { kind: "refused"; message: string; code?: string }
  /** No answer, or a server error: it may or may not have happened. Retry with the same id to find out. */
  | { kind: "unknown"; message: string };

export async function submitOnce<T>(send: Send, path: string, body: Record<string, unknown>): Promise<Submitted<T>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    return { kind: "done", result: await send<T>("POST", path, body, abort.signal) };
  } catch (e) {
    const { status = 0, message = "", code } = (e ?? {}) as WithStatus;
    if (status >= 400 && status < 500) return { kind: "refused", message, code };
    return { kind: "unknown", message: "We couldn't confirm it with the server." };
  } finally {
    clearTimeout(timer);
  }
}
