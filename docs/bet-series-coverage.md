# Bet Series: requirements coverage

Every requirement from the Bet Series feature list, where it shows up in `frontend/`, the API route in `backend/` that carries it out, and the test that checks it. Rules live in `backend/src/engine.ts`; tests are `backend/src/engine.test.ts` (rules) and `backend/src/api.test.ts` (HTTP). As of 2026-11-14 every item is covered; the open team questions at the end have demo defaults.

## Core concept

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| YES/NO bets in a friend group | Bet page, Dashboard | `POST …/bets`, `…/wager` | rules: wagers; API: wagers |
| Virtual coins across a Bet Series | Series creation, Dashboard | `startingCoins`, `balances()` | rules: starting hands out coins |
| Several series at once | Sidebar switcher, Home | `GET /api/state` lists all of yours | API: who can see it |
| Ranked by remaining coins at the end | Results, Leaderboard | `standings()`, `finalOrder` | rules: tiebreak tests |
| Losers do favors or real money, by mode | Results | `ASSIGNERS` (per mode) | rules: pledged, shared pool |

## Series creation

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Name and description | Series creation, Basics | `POST /api/series` | API: creating a series |
| Number of bets | Basics | `settings.betCount` (1–50) | rules: add bets up to the count |
| Participants (invited friends) | Basics, Invite friends; Home invitations | `invite[]`, `…/join`, `/api/join` | API: inviting, joining by code |
| Bottom X losers | Basics | `settings.losers` | rules: shared pool pairing |
| Starting coins (e.g. 1,000) | Basics | `settings.startingCoins` (100–100,000) | rules: start hands out coins |
| Mode and advanced settings | Mode, Advanced rules | `normalizeSettings()` | rules and API flows |
| Host can play too | "I'm playing too" | `settings.hostPlays` | rules: host resolves even when playing |
| All bets before start, or add during | Advanced, Writing bets | `settings.betCreation` | rules: add bets only when allowed |

## Modes

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| A: real money, host minimum | Mode A card, minimum field; Results "owes $" | `settings.minContribution`, `ASSIGNERS.money` | (records only; see open questions) |
| B: each player pledges their own favor | Lobby, Pledged favors | `…/favors` (replaces own pledge) | rules: self-pledged favors |
| B: bottom X do their own pledge | Results, Favors owed | `ASSIGNERS.pledge`, `…/favor-done` | rules: self-pledged favors |
| C: shared pool, at least one each | Lobby, Favor pool | `startBlockers()` | rules: start is blocked until favors… |
| C: host sets one or several favors each | Mode C, Favors each player can add | `settings.favorsPerPlayer` (1–5) | rules: start blockers |
| C: top X pick for bottom X, rank 1 for last | Results, Favor picks | `ASSIGNERS.pool`, `…/assignments` | rules and API: favor picks |
| C: exclusive or reusable pool | Mode C, Favor pool toggle | `settings.exclusivePool` | rules: exclusive and nonexclusive |

## Lobby

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Join and review the rules | Lobby, Rules panel | `…/join`, `/api/join` | API: joining by code |
| Submit favors | Lobby, favor panel | `…/favors`, `DELETE …/favors/:id` | rules: start blockers |
| Host kicks before start | Lobby, Players, Kick | `…/kick` (lobby only) | rules: kick; API: only the host |
| Start: coins handed out, rules locked | Lobby, Start | `…/start`; no route edits settings | rules and API: starting |
| X fixed once created | (no edit control) | settings have no update route | by design |

## Betting

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Host writes YES/NO questions | Lobby Bets; Dashboard Host controls | `POST …/bets` | API: lobby flow |
| Several bets open at once | Dashboard, Open tab | all drafts open at start | rules: starting opens bets |
| Pick a side and wager | Bet page ticket | `…/wager` | rules and API: wagers |
| Add more coins | Ticket ("Add") | `…/wager` on the same side | rules and API: wagers |
| Withdraw in the first 15 minutes only | Ticket, Withdraw with countdown | `…/withdraw`, `withdrawUntil()` | rules: withdraw only in the window |
| See others' picks and stakes before close | Bet page, Who's on what | wagers in `state` | API: state |
| Host decides YES or NO, even if playing | Bet page, Host controls | `…/resolve` (host only) | rules and API: host resolves |
| Winners split the pool by stake | Bet page, Payouts | `settle()` | rules: proportional split, rounding |
| Everyone on one side: refund | Bet page result banner | `settle()` refund branch | rules: one side refunds |
| Host cancels: refund | Host controls, Cancel bet | `…/cancel` | rules: canceling refunds |
| Balances and ranks update per resolved bet | Top bar, Dashboard, Leaderboard | `standings()` uses settled coins | rules: tiebreak tests |

## Leaderboard and losing

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Ranked by coin balance | Leaderboard, Dashboard | `standings()` | rules: tiebreaks |
| Bottom X lose | Leaderboard dashed line, "Bottom X" tag | `losing` flag | rules: pledge and pool endings |
| Final board decides favors | Results | `finish()` then `ASSIGNERS` | rules and API: picks |

## Advanced customizations

| Requirement | Screen | API / rule | Test |
| --- | --- | --- | --- |
| Tiebreak: first to reach the score | Advanced, Ties | `settings.tiebreak = "first"` | rules: first to reach |
| Same bet: earlier wager ranks higher | (same) | `firstAt` on the wager | rules: same bet, earlier wager |
| Tiebreak: random order | Advanced, Ties | `randomOrder` drawn at start | rules: random tiebreak |
| Allow or block new bets mid-series | Advanced, Writing bets | `settings.betCreation` | rules: add bets only when allowed |
| Favors each player can submit | Mode C | `settings.favorsPerPlayer` | rules: start blockers |
| Exclusive or reusable pool | Mode C | `settings.exclusivePool` | rules: pool picks |

## Screens

| Screen | Route |
| --- | --- |
| Home | `/` |
| Series creation | `/new` |
| Lobby | `/s/:id` while in the lobby |
| Series dashboard | `/s/:id` while live, `/s/:id/leaderboard` |
| Bet page | `/s/:id/bets/:betId` |
| Host controls | Dashboard side panel and Bet page panel |
| Results | `/s/:id` once finished |

## Future features already prepared

- **Custom favor assignment:** add an entry to `ASSIGNERS` in `engine.ts` and a mode value in `types.ts`.
- **Participant consent:** the lobby "I'm ready" checkbox is the agreement; changing the shared pool clears everyone's agreement.
- **Real money:** mode A is selectable and records who owes the minimum; no payment code exists.

## Open team questions and the demo defaults

| Question | Default in the code |
| --- | --- |
| Withdraw only in the first 15 minutes? | Yes by default; the host can pick Never, 5, 15 or 30 |
| When does the countdown start? | When the bet opens (series start for bets written up front) |
| Can players switch sides? | Only by withdrawing inside the window and betting again |
| Which tiebreaks? | First to reach (then earlier wager, then join order) or random |
| Edge cases | Players who never moved count as reaching their score at the start; a fully canceled series ranks by the tiebreak alone |
| How do players approve favors? | The ready checkbox; any change to the pool resets it |
| Limits on favor content? | 3 to 120 characters; the host can kick before start |
| Real money in the MVP? | Shown and recorded only, marked "Preview"; nothing is charged |
