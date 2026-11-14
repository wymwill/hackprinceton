import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { request, useStore } from "./store.tsx";
import type { Clan, Person, SocialState } from "./types.ts";

const POLL_MS = 10_000;

/** "ABCDEFGH" → "ABCD-EFGH", easier to read out loud. */
export const prettyCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

export const friendLink = (code: string) => `${window.location.origin}/add/${code}`;
export const clanLink = (code: string) => `${window.location.origin}/clan/${code}`;

/** Friends and clans: loads on mount, refreshes every few seconds, and wraps each action with a toast. */
export function useSocial() {
  const { toast } = useStore();
  const [data, setData] = useState<SocialState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await request<SocialState>("GET", "/social/state"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(() => !document.hidden && load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const run = useCallback(
    async <T,>(method: "POST" | "DELETE", path: string, body?: unknown, ok?: string): Promise<T | undefined> => {
      try {
        const result = await request<T>(method, path, body);
        await load();
        if (ok) toast(ok);
        return (result ?? (true as T)) as T;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong.", "err");
        return undefined;
      }
    },
    [load, toast]
  );

  return {
    data,
    error,
    reload: load,
    addFriend: (code: string) => run<Person>("POST", "/social/friends", { code }),
    removeFriend: (id: string) => run("DELETE", `/social/friends/${encodeURIComponent(id)}`, undefined, "Friend removed."),
    createClan: (name: string) => run<Pick<Clan, "id" | "name" | "code">>("POST", "/social/clans", { name }),
    joinClan: (code: string) => run<Pick<Clan, "id" | "name" | "code">>("POST", "/social/clans/join", { code }),
    leaveClan: (clanId: string) => run("POST", "/social/clans/leave", { clanId }, "You left the clan."),
  };
}

/** A QR code for a link, as an SVG string. Always dark on white, which every camera reads. */
export function useQr(link: string | null) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!link) return;
    let live = true;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#18171b", light: "#ffffff" } }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [link]);
  return svg;
}

/**
 * Share a link with the phone's share sheet (AirDrop, Messages, Nearby Share…),
 * or copy it where there isn't one.
 */
export function useShare() {
  const { toast } = useStore();
  const busy = useRef(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = async (title: string, text: string, url: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (canShare) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast("Link copied.");
      }
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (!(e instanceof DOMException && e.name === "AbortError")) toast("Couldn't share. Copy the code instead.", "err");
    } finally {
      busy.current = false;
    }
  };
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      toast("Couldn't copy. Select the code instead.", "err");
    }
  };
  return { canShare, share, copy };
}
