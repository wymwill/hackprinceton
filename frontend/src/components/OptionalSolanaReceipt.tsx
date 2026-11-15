import { Component, lazy, Suspense, type ReactNode } from "react";
import type { WagerReceipt } from "../lib/types.ts";
const Receipt = lazy(() => import("./SolanaWagerReceipt.tsx"));
class ReceiptBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p className="hint">Solana receipts are unavailable. Betting still works normally.</p> : this.props.children; }
}
export function OptionalSolanaReceipt({ receipt, account, betId }: { receipt: WagerReceipt | null; account: string; betId: string }) {
  const key = `bookie:solana-devnet:${account}:${betId}`;
  return <ReceiptBoundary key={key}><Suspense fallback={<p className="hint">Loading Solana receipts…</p>}><Receipt key={key} receipt={receipt} storageKey={key} /></Suspense></ReceiptBoundary>;
}
