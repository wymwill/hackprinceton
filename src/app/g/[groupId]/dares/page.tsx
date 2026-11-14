import { Suspense } from "react";
import Dares from "@/screens/Dares";

export const metadata = { title: "Dares · Betting with Friends" };

export default function Page() {
  return (
    <Suspense>
      <Dares />
    </Suspense>
  );
}
