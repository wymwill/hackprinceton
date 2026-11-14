import { Suspense } from "react";
import Home from "@/screens/Home";

export const metadata = { title: "Alea" };

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
