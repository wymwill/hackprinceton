/** Minimal authoritative wager fields committed by a wallet; names and questions stay private. */
export type WagerCommitment = {
  requestId: string; wagerId: string; seriesId: string; betId: string; outcomeId: string;
  amount: number; previousStake: number; totalStake: number; placedAt: string;
};
export function wagerCommitment(value: WagerCommitment): string {
  const ids = [value.requestId, value.wagerId, value.seriesId, value.betId, value.outcomeId];
  if (ids.some((id) => typeof id !== "string" || !id || id.length > 128)) throw new Error("Invalid wager receipt");
  if (![value.amount, value.previousStake, value.totalStake].every((n) => Number.isSafeInteger(n) && n >= 0) || value.amount < 1 || value.previousStake + value.amount !== value.totalStake) throw new Error("Invalid wager amounts");
  const date = Date.parse(value.placedAt);
  if (!Number.isFinite(date)) throw new Error("Invalid wager time");
  return JSON.stringify({ version: 1, app: "Bookie", type: "virtual-wager", requestId: value.requestId, wagerId: value.wagerId, seriesId: value.seriesId, betId: value.betId, outcomeId: value.outcomeId, amount: value.amount, previousStake: value.previousStake, totalStake: value.totalStake, placedAt: new Date(date).toISOString() });
}
export async function receiptDigest(value: WagerCommitment): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(wagerCommitment(value)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
export function receiptMemo(digest: string): string {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid receipt fingerprint");
  return `Bookie:virtual-wager:v1:${digest}`;
}
export const devnetExplorer = (signature: string) => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
export function receiptState(status: { err: unknown; confirmationStatus: string | null } | null, height: bigint, expiry: bigint): "confirmed" | "failed" | "pending" {
  if (status?.err) return "failed";
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return "confirmed";
  // A processed transaction may still confirm after its original validity window.
  return !status && height > expiry ? "failed" : "pending";
}
