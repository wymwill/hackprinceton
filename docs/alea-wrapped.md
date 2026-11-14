# Alea Wrapped

Personal Wrapped is available from **Your Alea Wrapped** on Profile. `/wrapped-demo` is a public, fictional walkthrough and is stamped `DEMO MODE` on the story and export. Real recaps require sign-in and are returned only from the signed-in caller's `my_series_state` snapshot. `/api/wrapped` accepts a year, ignores caller-supplied user IDs, and responds `private, no-store`. The demo does not call the API or mix records with account history.

## What the numbers mean

- One market with the caller's wager is one bet/market. In a settled market, the immutable settlement result supplies stake, payout and net; for an open market the current aggregate wager supplies the stake. Each bet is counted once.
- Total wagered includes recorded stakes on refunded or later canceled markets because those coins were still committed. Net uses actual `series_bet_results.net` for resolved bets only. Refund net is zero; pending markets contribute no net. Current balance is never used as profit.
- Win rate is profitable (`net > 0`) non-refunded, non-tied resolved wagers divided by the same eligible sample. Pending, canceled, refunded, ties and missing outcome records are excluded. A first-listed tie can have real payout/net; it remains in net but is excluded from win rate.
- Streaks use those same eligible settled bets in settlement-time order. Missing or out-of-year timestamps are omitted. A zero result breaks a streak. The cumulative timeline includes actual non-refunded tie payouts (including first-listed tie rules); those ties still do not count as wins/losses for streaks or win rate.
- Best and worst moments use largest positive and most negative actual net result. Their market link goes to the original private-in-series bet page.
- Social awards compare only players in the same series, only on shared eligible settlements, and only after five such comparisons. “Nemesis” counts markets where the other player's net exceeded yours; “ride or die” and “opposite” use the recorded selected outcome. These awards are shown only to the recap owner.
- Archetype rules are deterministic and ordered: undefeated requires at least 8 eligible wins and no eligible loss; comeback requires at least 5 dated eligible settlements, a low point at or below −100 followed by a positive ending at least 100 coins higher; sniper requires 8–20 recorded bets, 8 eligible outcomes and at least 75% wins; whale requires 4 bets and at least half of wagers at least 50% of that series' starting bankroll; cautious accountant requires 5 bets and average stake at most 10% of starting bankroll; delusional optimist requires 5 eligible outcomes, under 35% wins and average stake at least 20%; chaos merchant requires 5 eligible results; otherwise steady hand. Zero wagers receive Fresh Account. No label invents historical odds or time-ordered consensus.

The source stores each player's current aggregate wager and first/updated timestamps, plus immutable final stakes/payouts/net and settlement time. It does not store a complete wager-change history, historical odds, or the crowd at the moment a person placed a wager. Wrapped therefore does not claim those facts. Users who left a series cannot see it in their current personal snapshot, matching the app's existing membership access.

## Story, House and sharing

The 9-slide story covers opening, verified totals, a justified archetype, best win, worst loss with a stable House catalog roast, five-market social awards, a cumulative settled P/L timeline, The House, and a summary poster. Keyboard arrows and touch swipes navigate; the progress bars are direct slide controls. Reduced-motion settings disable transitions and counter animation. Blank accounts receive complete but honest empty slides and a challenge link.

The private API computes summary statistics before the House request. It sends only fixed event/flavor enums and numeric statistics to the existing validated Responses adapter. The adapter chooses a punchline from the fixed `wrapped` quip catalog; it cannot create a statistic, outcome or relationship. User and market text are not sent. Missing credentials, provider failures and serverless deployments without persistent shared cache get deterministic commentary. The cache is the same ignored `.data/house` store used by the bet commentator. No schema change or database migration is required.

The closing poster downloads as a 1080×1920 PNG and uses native file sharing where the browser supports it. The story does not publish a public history URL or share to clan chat; there is no persistent privacy-safe recap token in the existing system. Export is explicit, and the public demo contains fictional data only.

## Validation

```sh
npm run test:wrapped
npm run test:wrapped-local
npm run test:wrapped-ui
npm run test:house
npm run typecheck
npm run lint
npm run build
```

The local API script refuses non-loopback service URLs and uses the in-memory Supabase test stand-in. Browser tests cover desktop/mobile story navigation, export, and reduced motion. No live OpenAI call or production database write is needed.
