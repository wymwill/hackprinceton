"use client";

import type { GroupView } from "@/lib/markets/types";
import { useApp } from "./AppProvider";
import { Button } from "./ui";

export const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`;

/**
 * Share the group's invite link. Phones get the system share sheet (Messages,
 * AirDrop, and so on). Anywhere else, or if sharing fails, it copies the link.
 */
export default function ShareInvite({ group, className = "", compact = false }: { group: Pick<GroupView, "name" | "inviteCode">; className?: string; compact?: boolean }) {
  const { toast } = useApp();

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied.");
    } catch {
      toast("Couldn't copy. The link is in Settings.", "warn");
    }
  };

  const share = async () => {
    const url = inviteUrl(group.inviteCode);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Join ${group.name} on Alea`, text: `Come bet with us in ${group.name}. No money, just bragging rights and dares.`, url });
        return;
      } catch (err) {
        // Closing the share sheet isn't an error worth a fallback.
        if ((err as Error).name === "AbortError") return;
      }
    }
    await copy(url);
  };

  return (
    <Button onClick={share} className={className} aria-label={`Share an invite link to ${group.name}`}>
      <span className="material-symbols-outlined text-[18px]" aria-hidden>
        ios_share
      </span>
      {compact ? "Invite" : "Share invite link"}
    </Button>
  );
}
