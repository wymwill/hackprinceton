import { Suspense } from "react";
import Markets from "@/screens/Markets";

export const metadata = { title: "Markets · Alea" };

export default function Page() {
  return (
    <Suspense>
      <Markets />
    </Suspense>
  );
}
