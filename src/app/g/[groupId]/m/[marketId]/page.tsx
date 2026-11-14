import { Suspense } from "react";
import Market from "@/screens/Market";

export const metadata = { title: "Market · Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <Market />
    </Suspense>
  );
}
