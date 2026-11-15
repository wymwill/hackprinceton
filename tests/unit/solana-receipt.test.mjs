import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { wagerCommitment, receiptDigest, receiptMemo, receiptState, devnetExplorer } from "../../shared/solanaReceipt.ts";
const frontendRequire = createRequire(new URL("../../frontend/package.json", import.meta.url));
const kit = frontendRequire("@solana/kit");
const memo = frontendRequire("@solana-program/memo");
const receipt = {requestId:"request-1",wagerId:"wager-1",seriesId:"series-1",betId:"bet-1",outcomeId:"yes",amount:50,previousStake:90,totalStake:140,placedAt:"2026-11-15T10:00:00Z"};

test("commitment is stable across retries, property order, and private display fields", async () => {
  const digest = await receiptDigest(receipt);
  const retried = { ...receipt, placedAt: "2026-11-15T05:00:00-05:00", replayed: true, outcome:"private label", player:"private name" };
  assert.equal(await receiptDigest(retried), digest);
  const text = receiptMemo(digest);
  assert.equal(text, `Bookie:virtual-wager:v1:${digest}`);
  for (const value of [receipt.requestId,receipt.seriesId,receipt.betId,"private name","private label"]) assert.ok(!text.includes(value));
  assert.ok(new TextEncoder().encode(text).length < 200);
});

test("changing any committed wager detail changes the fingerprint", async () => {
  const digest = await receiptDigest(receipt);
  for (const patch of [{requestId:"request-2"},{outcomeId:"no"},{amount:51,totalStake:141},{placedAt:"2026-11-16T10:00:00Z"}]) assert.notEqual(await receiptDigest({...receipt,...patch}),digest);
  assert.throws(() => wagerCommitment({...receipt,amount:-1}));
  assert.throws(() => wagerCommitment({...receipt,totalStake:999}));
  assert.throws(() => receiptMemo("unvalidated input"));
});

test("uncertain transactions stay pending until confirmed, failed, or expired", () => {
  assert.equal(receiptState(null,10n,20n),"pending");
  assert.equal(receiptState(null,21n,20n),"failed");
  assert.equal(receiptState({err:null,confirmationStatus:"processed"},21n,20n),"pending");
  assert.equal(receiptState({err:null,confirmationStatus:"confirmed"},10n,20n),"confirmed");
  assert.equal(receiptState({err:{InstructionError:[0,"fail"]},confirmationStatus:"confirmed"},10n,20n),"failed");
  assert.match(devnetExplorer("abc"),/cluster=devnet$/);
});

test("real Solana Kit signs a Memo transaction locally without transferring any funds", async () => {
  const signer = await kit.generateKeyPairSigner();
  const instruction = memo.getAddMemoInstruction({memo:receiptMemo(await receiptDigest(receipt)),signers:[signer]});
  const message = kit.pipe(kit.createTransactionMessage({version:0}),
    (m)=>kit.setTransactionMessageFeePayerSigner(signer,m),
    (m)=>kit.setTransactionMessageLifetimeUsingBlockhash({blockhash:kit.blockhash("11111111111111111111111111111111"),lastValidBlockHeight:100n},m),
    (m)=>kit.appendTransactionMessageInstruction(instruction,m));
  const signed=await kit.signTransactionMessageWithSigners(message);
  kit.assertIsFullySignedTransaction(signed);
  assert.ok(kit.getSignatureFromTransaction(signed));
  assert.equal(message.instructions.length,1);
  assert.equal(instruction.programAddress,memo.MEMO_PROGRAM_ADDRESS);
  assert.match(memo.parseAddMemoInstruction(instruction).data.memo,/^Bookie:virtual-wager:v1:/);
});
