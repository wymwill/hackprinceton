"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/components/AppProvider";
import BookieMark from "@/components/BookieMark";
import { Button, Loading, card } from "@/components/ui";

/** `/`: go to your first group, or offer to create or join one. */
export default function Home() {
  const { state, open } = useApp();
  const router = useRouter();
  const first = state?.groups[0]?.id;
  useEffect(() => {
    if (first) router.replace(`/g/${first}`);
  }, [first, router]);

  if (!state || first) return <Loading />;
  return (
    <div className={`${card} max-w-lg mx-auto mt-10 p-8 flex flex-col items-center text-center gap-4`}>
      <BookieMark size="md" label={false} />
      <h1 className="font-display text-headline-lg text-on-surface">Bet with your friends on real life</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">No money. Tokens or points, a Bookie who sets fair odds and settles it with proof, and dares that actually get done.</p>
      <div className="flex gap-2">
        <Button tone="primary" onClick={() => open("create-group")}>
          Create a group
        </Button>
        <Button onClick={() => open("join-group")}>Join with code</Button>
      </div>
    </div>
  );
}
