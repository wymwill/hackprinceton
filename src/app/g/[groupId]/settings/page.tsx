import { Suspense } from "react";
import Settings from "@/screens/Settings";

export const metadata = { title: "Settings · Alea" };

export default function Page() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
