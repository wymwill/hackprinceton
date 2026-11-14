import "server-only";

/** A message id (a positive whole number) from a URL or body, or null. */
export function messageId(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
