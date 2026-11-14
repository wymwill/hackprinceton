import { Suspense } from "react";
import LiveReceipt from "@/screens/LiveReceipt";

export const metadata = { title: "Receipt · Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <LiveReceipt />
    </Suspense>
  );
}
