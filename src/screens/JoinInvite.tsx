"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { useApp } from "@/components/AppProvider";
import { Button, Empty, Loading, card, label } from "@/components/ui";

type Preview = { groupId: string; name: string; emoji: string; mode: "tokens" | "points"; members: string[]; alreadyMember: boolean };

/**
 * Where an invite link lands. Shows the group before you commit, and who
 * you'll join as. Opening the link never joins by itself: you tap Join.
 */
export default function JoinInvite() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { state, me, joinGroup, toast } = useApp();
  const demo = state?.auth.mode === "demo";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-check when you switch who you're playing as: you may already be in.
  useEffect(() => {
    if (!me) return;
    let live = true;
    fetch(`/api/invites/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok) {
          setPreview(json.result);
          setError(null);
        } else setError(json?.error?.message ?? "That invite link didn't work.");
      })
      .catch(() => live && setError("Can't reach the server. Check your connection."));
    return () => {
      live = false;
    };
  }, [code, me]);

  if (error) {
    return (
      <div className="max-w-md mx-auto">
        <Empty icon="link_off" title="Invite not found">
          <p>{error}</p>
          <p className="mt-2">Ask a friend in the group to send the link again.</p>
        </Empty>
      </div>
    );
  }
  if (!preview || !me) return <Loading />;

  const join = async () => {
    setBusy(true);
    const r = await joinGroup(code);
    setBusy(false);
    if (r) {
      toast(`You're in ${preview.name}.`);
      router.push(`/g/${r.id}`);
    }
  };

  return (
    <div className="max-w-md mx-auto flex flex-col gap-4">
      <section className={`${card} p-6 flex flex-col items-center text-center gap-4`}>
        <p className={label}>You&apos;re invited to</p>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[44px] leading-none" aria-hidden>
            {preview.emoji}
          </span>
          <h1 className="font-display text-headline-lg text-on-surface">{preview.name}</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {preview.members.length} {preview.members.length === 1 ? "friend" : "friends"} · playing for {preview.mode}
          </p>
        </div>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Members">
          {preview.members.map((n) => (
            <li key={n} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-surface-container-high font-label-md text-label-md text-on-surface">
              <Avatar name={n} size={22} />
              {n.split(" ")[0]}
            </li>
          ))}
        </ul>
        {preview.alreadyMember ? (
          <>
            <p className="font-body-md text-body-md text-on-surface-variant">{me.name}, you&apos;re already in this group.</p>
            <Button tone="primary" className="w-full h-12" onClick={() => router.push(`/g/${preview.groupId}`)}>
              Open the group
            </Button>
          </>
        ) : (
          <>
            <Button tone="primary" className="w-full h-12" disabled={busy} onClick={join}>
              {busy ? "Joining…" : `Join as ${me.name}`}
            </Button>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Not {me.name.split(" ")[0]}? {demo ? "Switch in Playing as at the top first." : "Sign out at the top, then open the link again."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
