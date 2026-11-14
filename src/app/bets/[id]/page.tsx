import { Suspense } from "react";
import LiveBet from "@/screens/LiveBet";

export const metadata = { title: "Bet · Bookie" };

export default function Page() {
  return (
    <Suspense>
      <LiveBet />
    </Suspense>
  );
}
