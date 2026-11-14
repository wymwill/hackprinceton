import { Suspense } from "react";
import LiveBet from "@/screens/LiveBet";

export const metadata = { title: "Bet · Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <LiveBet />
    </Suspense>
  );
}
