# Text Bookie: the iMessage agent (Photon)

Bookie lives where your friends already talk. Players text Bookie's number on iMessage, or add it to the group chat, and bet without opening the app:

| Text | Bookie does |
| --- | --- |
| `bets` | Lists the open bets you can play, soonest to close first, with odds and your stake |
| `bet 50 on yes #1` | Places a wager on bet #1. Also understood: `put 100 on Jake`, `50 on no for 2`, `bet all on yes #1` |
| `board` | Standings in your running series, and who's in the losing spot |
| `coins` | Free coins and coins in play |
| `link CODE` / `unlink` | Connect or disconnect this phone |
| `help` | The menu |

Replies feel live. Each message is marked read straight away, a typing indicator shows while Bookie works, and the answer arrives a moment later. Locally, answers take 3–10 ms plus the network.

In a group chat, Bookie answers only commands or messages that start with "bookie", and it replies to the message so it's clear who it's answering. If `GOOGLE_API_KEY` is set, other free-form texts ("put fifty on the knicks") go to Gemini to be read as a command. Gemini has a 4-second limit, and Bookie falls back to a hint.

It's built on [Photon Spectrum](https://photon.codes/docs/spectrum-ts/getting-started), Photon's messaging SDK for AI agents. The same code also runs on WhatsApp Business and Telegram.

## How it fits together

```
iPhone ──iMessage──▶ Photon (your line) ──▶ agent/index.ts  (npm run agent, a long-running process)
                                              │  agent/brain.ts: reads the text, writes the reply
                                              │  agent/bookie.ts: agent_* SQL functions (publishable key + agent secret)
                                              ▼
                                           Supabase (migration 0023) ◀── the app (Profile → Text Bookie)
```

- **Linking.** On Profile → Text Bookie, a player gets a one-time 8-character code that lasts 15 minutes. They text `link CODE` to Bookie, and their address (for example `iMessage:+15551234567`) then plays as them. On a phone, "Open Messages" opens a text with the code already filled in. The panel updates on its own when the link goes through.
- **Permissions.** The agent never gets the Supabase service-role key. It calls four functions: `agent_link`, `agent_unlink`, `agent_state` and `agent_wager`. Each checks a shared secret (only its SHA-256 is stored), becomes the linked player for that one transaction, and runs the normal rules. A text can do exactly what that player could do in the app.
- **No double charges.** Each wager uses a request ID derived from Photon's message ID. If a message is delivered twice, the second delivery gets back the first receipt instead of placing another wager.

## Setup

### 1. Database

Apply `supabase/migrations/202611140023_imessage_agent.sql` in the Supabase SQL editor, or run `supabase db push`. Then set the agent secret once. Make one with `openssl rand -hex 32` and run:

```sql
select public.set_bookie_agent_secret('<your secret>');
```

Run it again whenever you rotate the secret.

### 2. Photon

1. Sign up at [app.photon.codes](https://app.photon.codes) and create a project.
2. In the project's **Settings**, copy the **Project ID** and **Project secret**.
3. Set up an iMessage line in the dashboard. Its number or email is what players text.

### 3. Environment

Add these to `.env.local` at the repo root. The agent reads that file, and the app reads `BOOKIE_IMESSAGE_ADDRESS`:

```
# Photon Spectrum (agent only)
SPECTRUM_PROJECT_ID=
SPECTRUM_PROJECT_SECRET=
# The same secret you passed to set_bookie_agent_secret (agent only; never VITE_ or NEXT_PUBLIC_)
BOOKIE_AGENT_SECRET=
# Bookie's iMessage number or email, shown on Profile → Text Bookie (app server)
BOOKIE_IMESSAGE_ADDRESS=+15551234567
# Optional: the app's address, mentioned in Bookie's help text
BOOKIE_APP_URL=https://your-bookie.example
```

The agent also uses the existing `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. If `GOOGLE_API_KEY` is set, it also uses Gemini for free-form texts; `BOOKIE_AGENT_MODEL` overrides the model.

### 4. Run it

```bash
npm run agent
```

It prints `Bookie agent is listening on imessage.` Text your Photon line `help` to check it.

The agent is a long-running process that holds Photon's message stream open. Run it anywhere that keeps a process up: your laptop for a demo, or Railway, Fly.io, Render or a small VM. It can't run as a Vercel function. The web app deploys as before.

To serve several channels at once, set `BOOKIE_AGENT_PROVIDERS=imessage,terminal`. With no Photon keys it runs in the **terminal** by default.

## Try it without Photon (local)

```bash
# 1. A local database that knows the agent secret
PORT=54439 BOOKIE_AGENT_SECRET=local-agent-secret-0123456789abcdef node tests/sql/local-supabase.mjs

# 2. The agent, chatting in your terminal
SUPABASE_URL=http://127.0.0.1:54439 SUPABASE_PUBLISHABLE_KEY=local \
BOOKIE_AGENT_SECRET=local-agent-secret-0123456789abcdef npm run agent
```

To get a code, sign up and open Profile → Text Bookie in the app pointed at the same local database. Or call `imessage_link_code` as a signed-in user. Then type `link CODE`, then `bets`.

## Checks

```bash
npm run test:agent          # what Bookie understands and replies (no network)
npm run test:series-sql     # includes tests/sql/agent.test.mjs: linking, secret, wagers, unlinking
npm run test:agent-local    # end to end against the local database (start it as above first)
```

## Notes and limits

- Bookie answers when texted. It doesn't yet message people first, for example "a bet closes in an hour". Spectrum can send at any time, so that's a natural next step.
- Hosts still open and settle bets in the app.
- Photon's Stable SDK is used, not the Beta 2.0 API. Don't mix their keys.
- To unlink, text `unlink`, or use **Unlink** on Profile.
