# hackprinceton — Bookie 🎲

A social platform where friend groups make no-money bets on real life. The stakes are reputation points, titles and dares. An AI bookie sets the odds from each friend's track record, settles bets from connected apps and cited evidence, and roasts the losers.

Built with Next.js 16 (App Router) and Tailwind v4. The UI was ported from the Google Stitch design export, and all data is mocked for now.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The layout is designed for a 1440px-wide desktop.

## Screens

| Route | Screen | Interactions |
| --- | --- | --- |
| `/` | Group Home | Live countdown, Fade/Back the bet, emoji reactions, a chat composer the AI bookie replies to, "Make it a bet" opens the bet builder, Back buttons in the right rail |
| `/bets/8842` | Bet Detail | Take the Bet / Pass / contrarian play, pool updates, side bets that back either person, odds chart |
| `/receipts/8704` | Settlement Receipt | Confetti, animated "L" stamp, Dispute opens a squad vote and updates the consensus bar, share link, download proof JSON |
| `/leaderboard` | Leaderboard | This Week / Season / All Time tabs drive the podium and the table |
| `/dares` | Dares | Punishment wheel spins and reports where it lands, Upload Proof moves your card to Proof Submitted, Approve/Redo voting |
| `/profile` | Profile | Bet history filters, Share Card, connect/disconnect proof apps |

The **+ Create Bet** button in the sidebar opens a bet builder. It shows an AI opening line computed by the toy odds model in `src/lib/data.ts`.

## Layout

- `src/app/globals.css`: design tokens from Stitch's `DESIGN.md` (colors, type scale, spacing) as a Tailwind v4 `@theme`
- `src/components/`: app shell (Sidebar, Header), `BookieProvider` (toasts and the Create Bet modal), and the modals
- `src/screens/`: one component per screen, converted from the Stitch HTML and then wired up with React state
- `src/lib/data.ts`: mock user, groups, nav and the odds model
