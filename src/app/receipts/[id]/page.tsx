import { Suspense } from "react";
import LiveReceipt from "@/screens/LiveReceipt";

export const metadata = { title: "Receipt · Bookie" };

export default function Page() {
  return (
    <Suspense>
      <LiveReceipt />
    </Suspense>
  );
}
