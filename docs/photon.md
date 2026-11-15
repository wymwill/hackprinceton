# Text Bookie with Photon 2.0

Bookie uses the **Photon 2.0 Beta API**, not Spectrum. Its command agent runs in a private iMessage conversation and persists account pairing, evidence, and queued replies in Supabase. No additional model key is required.

## Product fit and responsiveness

The messaging sponsor is [Photon at photon.codes](https://photon.codes/), whose focus is bringing agents into interfaces people already use. [photon.com](https://www.photon.com/) is a different enterprise digital transformation company. Bookie follows the messaging focus: short replies, standings in chat, image evidence in the same conversation, remembered proof selection, and an explicit human decision for results.

Replies bypass result-alert backlogs in other chats. After storing the incoming action, the webhook acknowledges it and immediately dispatches that conversation's queue using Next `after()`; it does not wait for the one-minute scheduler. The shared worker also prioritizes replies over result alerts. Simple phrases such as “who's winning?”, “show my bets”, “send proof”, “pause alerts” and “resume alerts” map directly to commands without a model call. Image captions remain evidence.

This is a focused command agent, not a general-purpose AI conversation. No fixed handset delivery time is guaranteed. Database, Photon and iMessage latency still apply; failures use the durable retry queue. Validate real response times on your deployed demo before presenting it.

## Player flow

1. In **Profile → Text Bookie**, choose **Connect iMessage**.
2. Send `LINK <code>` privately to the displayed Bookie address. The code expires after ten minutes and can be used once. Pairing opts you into result alerts.
3. Bookie confirms the connection. The profile updates automatically.

| Message | Action |
| --- | --- |
| `BETS` | Lists up to ten open/locked bets with short codes. |
| `PROOF <code> <note or link>` | Saves evidence for that bet. |
| `PROOF <code>` | Selects a bet; send an image or note within fifteen minutes. |
| `RESULTS` | Shows standings for your three most recent active/finished games. |
| `STOP` | Pauses automatic result alerts; commands still work. |
| `START` | Turns result alerts back on. |
| `HELP` | Shows the commands. |

Image messages can include a caption. Send one image per message, up to 10 MB. JPEG, PNG, WebP, GIF, HEIC and HEIF are accepted; browser support for HEIC varies. Unsupported attachments are ignored. Members see recent evidence under **iMessage proof** on the bet page; select **View image** to load it. URLs in evidence are stored as text and are not fetched by Bookie.

Proof is player-submitted evidence, **not an automatic result**. Only the host settles the bet through the existing game rules. When a host resolves or cancels a bet, opted-in members receive its result and their coin balance. Text `RESULTS` for the full standings. Coins remain virtual.

Disconnect from Profile to unlink your messaging identity and cancel queued messages. Existing proof stays with the game. Disconnect before pairing another number or moving the same number to another Bookie account. A message already handed to Photon cannot be recalled by disconnecting or texting STOP.

## Server setup

1. Sign up at [Photon 2.0 Beta](https://photon.codes/beta). Create a project and connect an iMessage channel/line in the Beta dashboard. Follow the official [iMessage quickstart](https://photon.codes/docs/beta/get-started/imessage). Use the project API key (`pho_sk_…`), project ID (`pho_prj_…`), and agent **User ID** for the connected iMessage identity. A line/resource ID is not a User ID. `PHOTON_IMESSAGE_ADDRESS` is the phone number/address players will text.
   **Shared-line demo:** add the exact human identity you will send from (phone number or Apple-account email), then assign a shared-pool number. Your own identity is the sender; the assigned number is Bookie's address. Start the conversation from that registered identity. Another identity, including your email instead of your phone number, may not reach that shared connection. For a whole group, use a channel setup that routes all players to the same configured agent (typically a dedicated line), or separately adapt routing for multiple assigned agents. This implementation intentionally accepts one agent User ID.

   **Finding the agent ID:** in a received message's Photon API Activities/event payload, copy `data.object.receivedBy.id` (`pho_usr_…`). Use the agent receiver's ID, not `sentBy.id` (the human), `space.id`, or the phone number. The event may also be inspected in Photon's message API. Never publish your API key while troubleshooting.

2. For an existing game database with no Photon tables, [the combined SQL Editor setup](../supabase/diagnostics/photon-setup.sql) installs tutorial credits and both Photon migrations in one transaction. Regenerate it with `node scripts/photon-sql.mjs > supabase/diagnostics/photon-setup.sql`. Its guards stop on missing prerequisites or existing Photon tables. This does not repair the migration ledger. Otherwise, apply all Supabase migrations in order, including `202611150001_photon_messaging.sql` and `202611150002_photon_responsive_replies.sql` in `supabase/migrations`. For an existing database, apply just pending migrations through your usual Supabase workflow.
3. Set server environment variables from `.env.example`: `PHOTON_API_KEY`, `PHOTON_PROJECT_ID`, `PHOTON_AGENT_USER_ID`, `PHOTON_IMESSAGE_ADDRESS`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `CRON_SECRET`. The existing `SUPABASE_URL` and publishable key are still needed. Keep the service-role key and Photon secrets on the server; never use frontend environment prefixes.
4. Deploy Bookie's Next server on public HTTPS, or use a public HTTPS development tunnel. In **Photon Beta → Project → Webhooks**, add `https://YOUR-HOST/api/photon/webhook`, payload API version **2026-07-01**, event **message.received**. Save its returned signing secret as `PHOTON_WEBHOOK_SECRET`, then restart/redeploy. The endpoint accepts only signed events from your configured project, iMessage, and a two-person conversation containing your agent and sender.
5. Schedule an authenticated **GET `/api/photon/dispatch` every minute**, header `Authorization: Bearer <CRON_SECRET>`. Use your host's scheduler; keep the secret out of the URL. This is required for retries and draining bursts. The code does not create a hosted schedule for you. If using Vercel cron, its `CRON_SECRET` authorization header matches this endpoint; configure an allowed interval for your hosting plan.
6. Pair two real test accounts and run the live checklist below. Photon credentials and a real connected line are needed to verify delivery; local tests do not send messages.

The profile shows “iMessage is coming soon” when any required setting is absent. A missing migration produces a setup error. Other Bookie features work without Photon configured.

## Live demo checklist

- Pair a player, send `BETS` and `RESULTS`, and confirm only their games appear.
- Send `PROOF <code>`, then a screenshot. Confirm the host sees it on the correct bet and another game cannot read it.
- Resolve a two-sided virtual bet. Confirm the message arrives with the correct result/balance.
- Text `STOP`, settle another bet, and confirm no automatic result alert. Text `START` to resume.
- Replay a webhook from Photon's delivery log. Confirm there is only one proof and reply.
- Temporarily make Photon unavailable, then restore it and invoke the dispatcher. Check queued messages retry.

## Delivery and access model

- The official `standardwebhooks` library verifies the original request bytes, signature, and five-minute timestamp window. Project, platform, bot identity, payload version, and conversation participants are checked separately. Unknown event shapes are ignored; payloads are limited to 64 KB.
- Pairing uses 96-bit random codes; only SHA-256 hashes are stored. Redemption checks expiry and consumes the code atomically. A sender already linked to another account cannot overwrite it.
- Inbound message IDs deduplicate proofs and replies. Receipt, proof/context updates, and outgoing reply are one database transaction. No phone number or claimed Bookie user ID from a message determines access.
- Proof reads use the signed-in player's RLS membership. Image bytes come from the fixed Photon attachment endpoint only after the same check; Photon credentials never reach the browser. Evidence is shared with game members, not only the host.
- A Postgres trigger queues alerts in the settlement transaction. Next `after()` attempts immediate delivery after successful resolve/cancel. Scheduled retries handle failures without requiring anyone to open Bookie.
- Workers lease ten pending rows at a time, prioritizing interactive replies. Immediate webhook dispatch is scoped to the active conversation. Rows are leased for two minutes. The durable outbox UUID becomes a stable Photon `Idempotency-Key`; an uncertain send is retried with that same key. Retries stop after ten attempts; operators can inspect pending rows (`sent_at is null`) and reset attempts after fixing configuration. API acceptance is recorded as `sent_at`; this **does not claim handset delivery**, which can be inspected in Photon. Delivery-status webhooks are not implemented.
- This version supports direct iMessage conversations, commands, and evidence. Group agents, voice, wagers by text, automatic evidence verification, and host settlement by text are not implemented.

## Checks

`npm run test:photon` exercises real migrations in PGlite and verifies signed fixtures with Standard Webhooks: expiring/single-use pairing, account isolation, duplicate proof, membership access, command responses, opt-out, result queuing, leases, acknowledgements, and disconnect cleanup. It does not establish a live iMessage channel.

Official references: [Beta webhooks](https://photon.codes/docs/beta/message-delivery/webhook), [Beta API reference](https://photon.codes/docs/beta/api-reference), and the [hackathon guidelines](https://somethingreat.notion.site/Hackathon-Guidelines-for-Photon-2-0-3f8e443f36bb81f9893fed0d08a4c01d). A deployed agent on a real Photon channel is needed for the sponsor demo.
