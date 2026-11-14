import { Suspense } from "react";
import JoinInvite from "@/screens/JoinInvite";

export const metadata = { title: "Join a group · Alea" };

export default function Page() {
  return (
    <Suspense>
      <JoinInvite />
    </Suspense>
  );
}
