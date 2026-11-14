import { Suspense } from "react";
import Markets from "@/screens/Markets";

export const metadata = { title: "Markets · Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <Markets />
    </Suspense>
  );
}
