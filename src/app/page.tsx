import { Suspense } from "react";
import Home from "@/screens/Home";

export const metadata = { title: "Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
