# AI game planner

New series offers **AI game planner** beside Quick game and Detailed setup. Describe a game, choose 2–20 players and 3–8 questions, then generate. The host can edit the preview and select **Use this draft** to load Detailed setup. Nothing is created until the normal Create series action. Existing drafts are not changed on a generation error or until the host applies a preview. Applied drafts use the existing device autosave.

## Setup

Install with `npm install`. Set these server-only variables in `.env.local` and restart `npm run dev`:

```
GOOGLE_API_KEY=your-gemini-api-key
GEMINI_PLANNER_MODEL=gemini-3.5-flash-lite
```

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). The planner uses Gemini independently of `HOUSE_MODE`; `GEMINI_API_KEY` is also accepted as an alias for `GOOGLE_API_KEY`. No database migration is needed. Never prefix the key with `VITE_` or `NEXT_PUBLIC_`.

Implementation follows LangChain's [JavaScript Deep Agents quickstart](https://docs.langchain.com/oss/javascript/deepagents/quickstart) and [customization guide](https://docs.langchain.com/oss/javascript/deepagents/customization): `createDeepAgent`, LangChain’s current [`ChatGoogle`](https://docs.langchain.com/oss/javascript/integrations/chat/google) adapter (`@langchain/google/node`), domain tools, and a structured output schema via `toolStrategy`.

`POST /api/series/plan` authenticates through the same Supabase flow as series creation. Body: `{ prompt, players, questionCount }`. Response: `{ result: { name, description, questions, punishments } }`. All generated questions start as YES/NO; the host can change their types in Detailed setup. Defaults are 1,000 coins, a shared pool, one loser, and two host punishment contributions (or fewer if only one idea was returned).

The agent reads the shared template catalog, uses `get_game_templates` and `validate_game_plan`, and returns a draft validated again on the server. It has no database, series-creation, payment, browser, shell, or external research tools. Default filesystem tools use fresh in-memory state for each request. No persistent checkpointer or cross-user conversation is configured. Only the supplied idea and preferences go to the provider, not account tokens, contacts, or existing games. Normal provider billing applies; tracing is not enabled by this feature.

Runs have a 45-second overall timeout, no provider retries, and a 16-step recursion limit. There is one active request per user and at most three attempts per minute per server process. This limiter is not shared across multiple deployed instances. Model failures, invalid drafts, missing keys and limits produce readable errors; Quick game and Detailed setup continue working.

## Verification

`npm run test:planner` runs the actual Deep Agents graph against a scripted LangChain test model, exercising template and validation tool calls, final structured output, malformed output, cancellation, input limits and per-user concurrency/rate limits. It makes no provider calls. `npm run typecheck`, `npm run lint`, and `npm run build` cover both apps and the production API route.

For production-route checks without provider calls, start `PORT=54429 node tests/sql/local-supabase.mjs`, build the app, then start Next on port 3218 with `SUPABASE_URL=http://127.0.0.1:54429 SUPABASE_PUBLISHABLE_KEY=local GOOGLE_API_KEY= GEMINI_API_KEY= npm run start -- -H 127.0.0.1 -p 3218`. Run `node tests/e2e/planner-local.mjs`. This checks 401, 400 and missing-key 503 responses without creating series or making model calls.
