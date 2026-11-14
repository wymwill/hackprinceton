import { Suspense } from "react";
import Leaderboard from "@/screens/Leaderboard";

export const metadata = { title: "Leaderboard · Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <Leaderboard />
    </Suspense>
  );
}
