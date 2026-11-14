"use client";

import { useRef, useState } from "react";
import { ago, useNow } from "@/lib/bets/format";
import type { BetView } from "@/lib/bets/types";
import Avatar from "./Avatar";
import { useBookie } from "./BookieProvider";

type Kind = "text" | "link" | "image";

/** Evidence submitted for a bet, plus the form to add more (for anyone in the bet, until it's settled). */
export default function EvidencePanel({ bet, bare = false }: { bet: BetView; bare?: boolean }) {
  const { state, user, submitEvidence, toast } = useBookie();
  const now = useNow(30_000);
  const [kind, setKind] = useState<Kind>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [claims, setClaims] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const me = state?.me;
  const involved = bet.creatorId === me || bet.entries.some((e) => e.userId === me);
  const canSubmit = involved && bet.status !== "settled";

  const submit = async () => {
    setBusy(true);
    let ok;
    if (kind === "image") {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setBusy(false);
        return toast("⚠️ Pick an image first.", "coral");
      }
      const form = new FormData();
      form.set("file", file);
      if (text.trim()) form.set("text", text.trim());
      if (claims) form.set("claimsOutcomeId", claims);
      ok = await submitEvidence(bet.id, form);
    } else {
      ok = await submitEvidence(bet.id, { kind, text: text.trim() || undefined, url: kind === "link" ? url.trim() : undefined, claimsOutcomeId: claims || undefined });
    }
    setBusy(false);
    if (ok) {
      setText("");
      setUrl("");
      if (fileRef.current) fileRef.current.value = "";
      toast("📎 Evidence added.", "lime");
    }
  };

  const tab = (k: Kind, label: string) => (
    <button
      key={k}
      onClick={() => setKind(k)}
      className={`px-3 py-1 rounded-lg font-label-md text-label-md ${kind === k ? "bg-surface-container-highest text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
    >
      {label}
    </button>
  );

  return (
    <section className={bare ? "flex flex-col gap-3" : "rounded-2xl bg-surface-container border border-[#2f384a] p-space-md flex flex-col gap-3"}>
      {!bare && (
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">📎 Evidence</h2>
          <span className="font-label-sm text-label-sm text-on-surface-variant">{bet.evidence.length} submitted</span>
        </div>
      )}

      {bet.evidence.length === 0 && <p className="font-body-md text-body-md text-on-surface-variant">Nothing yet. Screenshots, links, or a quick write-up all help.</p>}
      {bet.evidence.map((ev) => {
        const u = user(ev.userId);
        const o = bet.outcomes.find((x) => x.id === ev.claimsOutcomeId);
        return (
          <div key={ev.id} className="flex gap-3 p-3 rounded-xl bg-surface-container-low">
            <Avatar name={u?.name ?? "?"} src={u?.avatar} size={28} />
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                <b className="text-on-surface">{u?.name}</b> · {ev.kind} · {ago(ev.createdAt, now || Date.parse(ev.createdAt))}
                {o && <span className="ml-1 px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface">says {o.label}</span>}
                <span className="ml-1 text-on-surface-variant/70">{ev.id}</span>
              </span>
              {ev.text && <p className="font-body-md text-body-md text-on-surface break-words">{ev.text}</p>}
              {ev.url && (
                <a href={ev.url} target="_blank" rel="noopener noreferrer nofollow" className="font-body-sm text-body-sm text-primary break-all hover:underline">
                  {ev.url}
                </a>
              )}
              {ev.imageUrl && (
                <a href={ev.imageUrl} target="_blank" rel="noopener noreferrer">
                  <img src={ev.imageUrl} alt={`Evidence from ${u?.name}`} className="max-h-48 rounded-lg border border-[#2f384a]" />
                </a>
              )}
            </div>
          </div>
        );
      })}

      {canSubmit ? (
        <div className="flex flex-col gap-2 pt-2 border-t border-[#2f384a]">
          <div className="flex gap-1">
            {tab("text", "Statement")}
            {tab("link", "Link")}
            {tab("image", "Image")}
          </div>
          {kind === "link" && (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-md text-body-md"
            />
          )}
          {kind === "image" && (
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="font-body-sm text-body-sm text-on-surface-variant" />
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={kind === "text" ? "What happened?" : "Caption (optional)"}
            className="px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-md text-body-md"
          />
          <div className="flex items-center gap-2">
            <select
              value={claims}
              onChange={(e) => setClaims(e.target.value)}
              aria-label="Which outcome does this support?"
              className="flex-1 px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-md text-body-md"
            >
              <option value="">Doesn&apos;t pick a side</option>
              {bet.outcomes.map((o) => (
                <option key={o.id} value={o.id}>
                  Supports {o.label}
                </option>
              ))}
            </select>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg disabled:opacity-50">
              {busy ? "Adding…" : "Add evidence"}
            </button>
          </div>
        </div>
      ) : (
        bet.status !== "settled" && <p className="font-body-sm text-body-sm text-on-surface-variant">Join the bet to add evidence.</p>
      )}
    </section>
  );
}
