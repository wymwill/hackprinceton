import { Suspense } from "react";
import Dares from "@/screens/Dares";

export const metadata = { title: "Dares · Alea" };

export default function Page() {
  return (
    <Suspense>
      <Dares />
    </Suspense>
  );
}
