import { useRef, useState } from "react";
import { assertIsTransactionMessageWithBlockhashLifetime, assertIsTransactionWithBlockhashLifetime, getSignatureFromTransaction, isTransactionPartialSigner, sendAndConfirmTransactionFactory, signature, signTransactionMessageWithSigners } from "@solana/kit";
import { useConnect, useConnectedWallet, useDisconnect, useWallets } from "@solana/kit-plugin-wallet/react";
import { getAddMemoInstruction } from "@solana-program/memo";
import { solanaClient as client } from "../lib/solana-client.ts";
import { devnetExplorer, receiptDigest, receiptMemo, receiptState, type WagerCommitment } from "../../../shared/solanaReceipt.ts";
import type { WagerReceipt } from "../lib/types.ts";

type Record = { requestId: string; signature: string; wallet: string; digest: string; expiry: string; state: "confirmed" | "failed" | "pending"; receipt: WagerCommitment };
function readRecords(key: string): Record[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(values) ? values.filter((r): r is Record => !!r && typeof r === "object" && typeof r.requestId === "string" && typeof r.signature === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(r.signature) && /^[a-f0-9]{64}$/.test(r.digest) && /^\d+$/.test(r.expiry) && ["confirmed", "failed", "pending"].includes(r.state)).slice(0, 5) : [];
  } catch { return []; }
}
export default function SolanaWagerReceipt({ receipt, storageKey }: { receipt: WagerReceipt | null; storageKey: string }) {
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const [records, setRecords] = useState(() => readRecords(storageKey));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const recordsRef = useRef(records);
  const update = (record: Record, requirePersistence = false) => {
    const next = [record, ...recordsRef.current.filter((r) => r.requestId !== record.requestId)].slice(0, 5);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { if (requirePersistence) throw new Error("receipt_storage_unavailable"); }
    recordsRef.current = next;
    setRecords(next);
  };
  const current = receipt ? records.find((r) => r.requestId === receipt.requestId) : undefined;
  const check = async (record: Record) => {
    if (running.current) return;
    running.current = true; setBusy(true); setMessage("");
    try {
      const abortSignal = AbortSignal.timeout(15_000);
      const [statuses, height] = await Promise.all([
        client.rpc.getSignatureStatuses([signature(record.signature)], { searchTransactionHistory: true }).send({ abortSignal }),
        client.rpc.getBlockHeight({ commitment: "confirmed" }).send({ abortSignal }),
      ]);
      const state = receiptState(statuses.value[0], height, BigInt(record.expiry));
      update({ ...record, state });
      setMessage(state === "confirmed" ? "Receipt confirmed on Solana devnet." : state === "failed" ? "This transaction failed or expired. Your Bookie bet is unchanged; you can record its receipt again." : "Still awaiting confirmation. Check again before submitting another receipt.");
    } catch { setMessage("Couldn't check devnet. Keep this transaction link and check again later."); }
    finally { running.current = false; setBusy(false); }
  };
  const publish = async () => {
    if (running.current || !receipt || !connected?.signer || current && current.state !== "failed") return;
    running.current = true; setBusy(true); setMessage("Preparing your devnet receipt…");
    let pending: Record | null = null;
    try {
      if (!isTransactionPartialSigner(connected.signer)) throw new Error("This wallet cannot sign receipts. Try a wallet that supports signing Solana transactions.");
      const digest = await receiptDigest(receipt);
      const memo = getAddMemoInstruction({ memo: receiptMemo(digest), signers: [connected.signer] });
      const abortSignal = AbortSignal.timeout(60_000);
      const transactionMessage = await client.planTransaction([memo], { abortSignal });
      assertIsTransactionMessageWithBlockhashLifetime(transactionMessage);
      setMessage("Approve the devnet receipt in your wallet.");
      const signed = await signTransactionMessageWithSigners(transactionMessage, { abortSignal });
      assertIsTransactionWithBlockhashLifetime(signed);
      const prepared: Record = { requestId: receipt.requestId, signature: getSignatureFromTransaction(signed), wallet: connected.account.address, digest, expiry: transactionMessage.lifetimeConstraint.lastValidBlockHeight.toString(), state: "pending", receipt };
      // Save the signed transaction's identity BEFORE sending. A timeout must not prompt a duplicate.
      update(prepared, true);
      pending = prepared;
      setMessage("Sending receipt and waiting for devnet confirmation…");
      await sendAndConfirmTransactionFactory({ rpc: client.rpc, rpcSubscriptions: client.rpcSubscriptions })(signed, { commitment: "confirmed", abortSignal });
      update({ ...pending, state: "confirmed" });
      setMessage("Receipt confirmed on Solana devnet.");
    } catch (e) {
      setMessage(pending ? "Confirmation is uncertain. Check the saved transaction before trying again. Your Bookie bet is already saved." : e instanceof Error && e.message === "receipt_storage_unavailable" ? "Your browser could not save this receipt, so it was not sent. Allow local storage and try again." : e instanceof Error && /cannot sign|blockhash-based/.test(e.message) ? e.message : "Receipt canceled or unavailable. Your Bookie bet is already saved; you can try the receipt again.");
    } finally { running.current = false; setBusy(false); }
  };
  const download = (record: Record) => {
    const blob = new Blob([JSON.stringify({ network: "solana:devnet", ...record }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `bookie-receipt-${record.requestId}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <details className="solana-receipts" open={!!receipt || undefined}>
    <summary>Solana bet receipts <span className="cap">Devnet</span></summary>
    <div className="stack">
      <p className="hint">Sign a devnet fingerprint of your pick and virtual stake. Only your wallet address and fingerprint are public. Test SOL pays the fee.</p>
      {connected ? <div className="row wrap"><span className="num">{connected.account.address.slice(0, 5)}…{connected.account.address.slice(-5)}</span><button type="button" className="btn ghost sm" disabled={busy || disconnect.isRunning} onClick={() => disconnect.dispatch()}>Disconnect wallet</button></div> : wallets.length ? <div className="row wrap">{wallets.map((w) => <button key={w.name} type="button" className="btn sm" disabled={busy || connect.isRunning} onClick={() => connect.dispatch(w)}>Connect {w.name}</button>)}</div> : <p className="hint">Install a Solana wallet such as Phantom or Solflare, then refresh this page.</p>}
      {!!connect.error && <p className="hint warn" role="alert">Wallet connection was canceled or failed. Try again.</p>}
      {connected && <p className="hint">Use a devnet wallet funded with test SOL. <a className="red-t" href="https://faucet.solana.com" target="_blank" rel="noreferrer">Get test SOL ↗</a></p>}
      {receipt ? <button type="button" className="btn" disabled={busy || !connected?.signer || !!current && current.state !== "failed"} onClick={() => void publish()}>{busy ? "Recording…" : current?.state === "confirmed" ? "Receipt recorded" : current?.state === "pending" ? "Check pending receipt below" : "Record this bet on Solana"}</button> : <p className="hint">New receipts are available after a bet is accepted. Virtual coins stay in Bookie.</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {records.length > 0 && <ul className="solana-history">{records.map((r) => <li key={r.requestId}><div className="row wrap"><span className="cap">{r.state === "confirmed" ? "Confirmed" : r.state === "pending" ? "Unconfirmed" : "Failed / expired"}</span><a className="red-t" href={devnetExplorer(r.signature)} target="_blank" rel="noreferrer">View transaction ↗</a><button type="button" className="btn ghost sm" disabled={busy} onClick={() => void check(r)}>Check status</button><button type="button" className="btn ghost sm" onClick={() => download(r)}>Download proof</button></div></li>)}</ul>}
      <p className="hint">Wallet receipt only; Bookie manages the game. Links are saved on this browser.</p>
    </div>
  </details>;
}
