import { Suspense } from "react";
import Settings from "@/screens/Settings";

export const metadata = { title: "Settings · Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
