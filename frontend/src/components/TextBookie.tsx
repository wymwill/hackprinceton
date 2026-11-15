import { useCallback, useEffect, useState } from "react";
import { ApiError, request, useStore } from "../lib/store.tsx";
import { ConfirmButton, Panel } from "./ui.tsx";

type Link = { id: string; label: string; linkedAt: string };
type Info = { address: string | null; links: Link[] };
type Code = { code: string; expiresAt: string };

/**
 * Text Bookie: link your phone, then bet over iMessage ("bets", "bet 50 on yes #1").
 * The agent is agent/index.ts; this panel only makes the one-time code and lists links.
 */
export function TextBookie() {
  const { toast } = useStore();
  const [info, setInfo] = useState<Info | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setInfo(await request<Info>("GET", "/imessage"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load your linked phones.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  // While a code is showing, check every few seconds so the panel flips to "linked" as soon as the text lands.
  useEffect(() => {
    if (!code) return;
    const before = info?.links.length ?? 0;
    const t = window.setInterval(async () => {
      if (Date.now() > Date.parse(code.expiresAt)) return setCode(null);
      const next = await request<Info>("GET", "/imessage").catch(() => null);
      if (next && next.links.length > before) {
        setInfo(next);
        setCode(null);
        toast("Your phone is linked. Text Bookie \"bets\" to start.");
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [code, info?.links.length, toast]);

  const getCode = async () => {
    setBusy(true);
    try {
      setCode(await request<Code>("POST", "/imessage"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't make a code. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const unlink = async (id: string) => {
    try {
      await request("DELETE", `/imessage?id=${encodeURIComponent(id)}`);
      toast("Unlinked.");
      void load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't unlink. Try again.", "err");
    }
  };

  const address = info?.address;
  const smsHref = address && code ? `sms:${address}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(`link ${code.code}`)}` : null;

  return (
    <Panel label="Text Bookie" right={info && info.links.length > 0 ? `${info.links.length} linked` : undefined}>
      <div className="stack" style={{ gap: 12 }}>
        <p>
          Bet from your texts. Link your phone, then text Bookie <b>bets</b> to see what's open, <b>bet 50 on yes #1</b> to wager, or <b>board</b> for
          standings. Bookie can join your group chat too.
        </p>
        {info?.links.map((l) => (
          <div key={l.id} className="row" style={{ justifyContent: "space-between" }}>
            <span>
              <b>{l.label}</b>
              <span className="dim" style={{ display: "block", fontSize: 13 }}>
                Linked {new Date(l.linkedAt).toLocaleDateString()}
              </span>
            </span>
            <ConfirmButton className="btn ghost sm" label="Unlink" confirm="Unlink this phone?" onConfirm={() => void unlink(l.id)} />
          </div>
        ))}
        {code ? (
          <div className="stack" style={{ gap: 8 }}>
            <span className="cap">Your code (15 minutes)</span>
            <b style={{ fontFamily: "var(--mono)", fontSize: 28, letterSpacing: "0.18em" }}>{code.code}</b>
            <p>
              Text <b>link {code.code}</b> to {address ? <b>{address}</b> : "Bookie's number"}. This page updates when it's done.
            </p>
            {smsHref && (
              <a className="btn primary" href={smsHref}>
                Open Messages
              </a>
            )}
          </div>
        ) : (
          <button type="button" className="btn primary" onClick={getCode} disabled={busy || !info}>
            {info?.links.length ? "Link another phone" : "Get a link code"}
          </button>
        )}
        {info && !address && <p className="hint">Bookie's number isn't set up on this server yet. Ask the host of this Bookie to finish setup.</p>}
        {error && (
          <p className="hint warn" role="alert">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
