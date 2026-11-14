import { Suspense } from "react";
import Market from "@/screens/Market";

export const metadata = { title: "Market · Alea" };

export default function Page() {
  return (
    <Suspense>
      <Market />
    </Suspense>
  );
}
