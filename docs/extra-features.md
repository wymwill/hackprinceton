# Enable Bookie's extra features

Open [local Bookie](http://localhost:3000). `npm run dev` runs the API on 3000 and the UI on 5173; open 3000. Keep `.env.local` at the repository root and restart after changing keys. Use a normal browser with your wallet extension for the Solana flow.

## Database setup

The live project is `opixwxaamxffvcjblmjr`. A zero-row API check on November 15 found GitHub tables present, Photon tables missing, and tutorial-credit columns missing. Recheck before applying if another teammate has changed the database.

For that state, open the project's [SQL Editor](https://supabase.com/dashboard/project/opixwxaamxffvcjblmjr/sql/new) and run [photon-setup.sql](../supabase/diagnostics/photon-setup.sql). It includes canonical migrations `202611140021` (tutorial credits), `202611150001` (Photon), and `202611150002` (responsive replies), inside one transaction. It stops if prerequisites are missing or Photon is already partly installed. It does not replay earlier game migrations or repair the Supabase migration ledger. If you later adopt `supabase db push`, first reconcile the ledger with what was actually applied through the editor.

Generate the same SQL again with:

```bash
node scripts/photon-sql.mjs > supabase/diagnostics/photon-setup.sql
```

The server `sb_secret_…` key authorizes data API requests. It is not a Postgres password or Supabase Management API token, and cannot execute schema migrations. The signed-in dashboard account must have access to the correct project.

## Solana receipts

No key or migration is required for Solana.

1. Open Bookie in a browser with a Wallet Standard Solana wallet installed, such as Phantom or Solflare.
2. Choose **devnet** in the wallet and obtain test SOL from [the Solana faucet](https://faucet.solana.com).
3. Sign in and place a virtual wager in an active series.
4. Below the accepted wager, open **Solana bet receipts**, connect the wallet, and choose **Record this bet on Solana**.
5. Approve the devnet transaction in the wallet. Use **View transaction** to verify confirmation in Explorer. If confirmation is uncertain, use **Check status** before trying again.

The receipt is a signed Memo fingerprint, not on-chain settlement or verification that a bet's result is true. Stakes remain virtual coins in Bookie. Only devnet test SOL pays the network fee. Receipt links are stored in this browser/account, and duplicates are prevented within this UI, not globally across browsers. Full details: [Solana guide](solana.md).

## Photon iMessage

All seven required local configuration fields are present. The actual Node fetch client successfully read the project's message API; an earlier Python probe was blocked by Photon's browser-signature filter. This does not verify end-to-end Bookie message delivery.

1. Apply the database setup above.
2. In Photon Beta, ensure the webhook is `https://www.gamblewithfriends.club/api/photon/webhook`, API version `2026-07-01`, subscribing to **message.received**. Its signing secret must match `PHOTON_WEBHOOK_SECRET`.
3. In Bookie, go to **Profile → Text Bookie → Connect iMessage**.
4. Send the displayed `LINK <code>` to **+16289988199** from the identity assigned to your Photon shared line.
5. Text `RESULTS` or “who's winning?”. Text `BETS`, then `PROOF <code>` and a screenshot or note. Check that the host can see evidence on the correct bet.
6. Resolve a bet to test automatic result alerts. Hosts still call results in Bookie.
7. Configure an external scheduler to GET `/api/photon/dispatch` every minute with `Authorization: Bearer <CRON_SECRET>`. Use an interval supported by the hosting plan. This is required for retries; normal replies and results attempt immediate dispatch.

A production webhook goes to the deployed app, not localhost. Local testing can use the same database and pairing UI, but testing a different local backend requires a public HTTPS tunnel and its own webhook configuration. Avoid registering two receivers that process the same project events with different databases. Shared lines route only assigned sender identities to their agent; this version supports one configured agent identity. Full details: [Photon guide](photon.md).

## AI game planner

The planner uses Gemini through LangChain Deep Agents. It needs a Gemini API key; neither supported key setting is currently present locally.

1. Obtain a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Put `GOOGLE_API_KEY=...` in `.env.local`; `GEMINI_API_KEY` is an accepted alias.
3. Restart local development. For production, set the key in Vercel and redeploy.
4. Open **New series → AI game planner**, describe a game, generate a draft, and edit it before creating the series.

The model defaults to the configured `GEMINI_PLANNER_MODEL` or `gemini-3.5-flash-lite`. The key needs access/quota for that model. Full details: [Planner guide](game-planner.md).

## GitHub proof

Go to **Profile → GitHub**, enter a public username, connect, then sync. Public pushes and merged pull requests appear as evidence. No OAuth or token is needed. `GITHUB_TOKEN` is optional for higher API capacity. A public username connection does not prove account ownership.

## Tutorial credits, reminders and commentary

- **Tutorial credits:** the database setup above adds the missing credit columns and reward function. Complete the tour to receive 200 credits once. Replaying with `?` does not award more. Credits apply when your next series starts.
- **Reminders:** turn them on in Profile. They appear inside Bookie; no external provider or email setup is needed.
- **The House:** deterministic commentary works without a model key. Optional AI commentary uses `OPENAI_API_KEY`; local configuration does not currently contain it. Review [House documentation](the-house.md) before enabling paid generation on a deployment.
