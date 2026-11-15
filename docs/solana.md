# Solana virtual-bet receipts

Bookie can record a wallet-signed commitment to each accepted virtual wager on **Solana devnet**. This is an optional part of the betting screen, separate from Bookie's database transaction. It uses Solana Kit, Wallet Standard discovery, and the Memo program, following the official [frontend guide](https://solana.com/docs/frontend/react-hooks) and [Memo example](https://solana.com/developers/cookbook/transactions/add-memo).

## Demo

1. Install a Wallet Standard wallet that supports Solana devnet and transaction signing, such as Phantom or Solflare.
2. Switch the wallet to devnet and fund it with test SOL from [the Solana faucet](https://faucet.solana.com).
3. Sign in to Bookie and place a virtual bet normally.
4. Open **Solana bet receipts** below the wager confirmation, connect your wallet, and select **Record this bet on Solana**.
5. Approve the Memo transaction in your wallet. The wallet is the fee payer; only test SOL pays the devnet network fee. No SOL or tokens are transferred as stakes.
6. Once confirmed, use **View transaction** or **Download proof**. These actions are available for the last five receipt links stored for this bet on this browser/account.

No server wallet key, blockchain API key, custom program deployment, or database migration is required. Devnet RPC is fixed in `frontend/src/lib/solana-client.ts`. Mainnet is not offered. Wallet connections are not persisted for automatic reconnection.

## What goes on-chain

The Memo is `Bookie:virtual-wager:v1:<sha256>`. Its digest commits to a canonical JSON payload containing the app/version, submission and wager IDs, series and bet IDs, chosen outcome ID, added virtual coins, previous and total stake, and placement time. It excludes mutable display fields and retry flags so the same submission produces the same digest. Raw player names, questions, and punishments are not published. Wallet addresses and the fingerprint are public.

The downloaded JSON contains the committed receipt, digest, signing wallet, transaction signature, and recorded status. To check it independently, recompute `receiptDigest` using `shared/solanaReceipt.ts` and compare the memo in the confirmed devnet transaction. The receipt is the wallet's commitment to data received from Bookie; it is not an on-chain enforcement of Bookie's SQL rules, a server-signed attestation, verification that the prediction is true, or proof that the wallet owns a Bookie account.

## Failures and persistence

- Database acceptance happens first. An RPC outage, a declined wallet prompt, or a failed receipt never repeats or reverses the wager.
- The signed transaction signature is saved before broadcast (if local storage is unavailable, no transaction is broadcast), with its last valid block height. An uncertain send stays pending; **Check status** queries devnet before another attempt is allowed.
- A confirmed/finalized transaction with no error is marked confirmed. Failed transactions or absent transactions whose blockhash window expired can be retried. A processed transaction is left pending.
- Receipts are browser-local, scoped by Bookie user and bet. Saved links remain accessible on the bet page after betting closes. Reloading retains saved links, but clearing storage removes them from the UI. On-chain transactions remain public while retained by the network/explorer. Devnet history is not a production archive.
- Duplicate submission guards apply in this UI, not globally: Memo is not a custom program with an on-chain uniqueness rule. Another browser can publish the same commitment again.
- Solana SDK loading has a separate error boundary so it cannot break the wager form.

## Verification

`npm run test:solana` checks canonical commitments, changed wager fields, privacy of the memo, pending/confirmed/expired/error states, and actual Kit Memo construction/signing with an ephemeral local keypair. It makes no RPC calls and spends no funds. Live wallet approval and devnet confirmation require an installed funded devnet wallet.

The normal app checks remain `npm run typecheck`, `npm run lint`, and `npm run build`.
