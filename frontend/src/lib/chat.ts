/**
 * Clan chat on the client. History and sending go through the API
 * (/api/social/clans/:clanId/messages); new messages and deletions arrive live
 * over Supabase Realtime (postgres_changes on clan_messages, which only reaches
 * members, by the table's RLS policy).
 *
 * Messages are kept in one map by id, so a message that arrives twice (the send
 * response and the live event, or a catch-up after reconnecting) shows once.
 * Messages being sent carry a client id; the server returns the same message if
 * that id is sent again, so a retry can't post twice either.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, request, useStore } from "./store.tsx";
import { supabase } from "./supabase.ts";
import type { ChatMessage, ChatPage, ChatStatus, Id } from "./types.ts";

export const MAX_MESSAGE = 2000;
/** Characters as the server counts them (code points), so an emoji counts once. */
export const charCount = (s: string) => [...s].length;

/** When the live connection is down, check for new messages this often instead. */
const OFFLINE_POLL_MS = 4000;
/** Even when live, quietly check now and then in case an event was missed. */
const LIVE_CHECK_MS = 30_000;

export type Connection = "connecting" | "live" | "offline";
export type Pending = { clientId: string; body: string; createdAt: string; failed: boolean };

const CHAT_READ_EVENT = "alea:chat-read";

/** A clan_messages row as Realtime sends it, in the shape the API uses. */
function fromRow(r: Record<string, unknown>): ChatMessage {
  const created = typeof r.created_at === "string" ? new Date(r.created_at) : new Date();
  return {
    id: Number(r.id),
    clanId: String(r.clan_id),
    userId: (r.user_id as string | null) ?? null,
    kind: r.kind === "system" ? "system" : "text",
    event: (r.event as string | null) ?? null,
    body: typeof r.body === "string" ? r.body : "",
    data: r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {},
    authorName: typeof r.author_name === "string" ? r.author_name : "",
    authorAvatar: (r.author_avatar as string | null) ?? null,
    clientId: (r.client_id as string | null) ?? null,
    createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
    deleted: r.deleted_at != null,
  };
}

const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

const messagesPath = (clanId: Id) => `/social/clans/${encodeURIComponent(clanId)}/messages`;

/** One clan's chat: history, live updates, sending, deleting, and read tracking. */
export function useClanChat(clanId: Id) {
  const { toast } = useStore();
  const [byId, setById] = useState<Map<number, ChatMessage>>(new Map());
  const [pending, setPending] = useState<Pending[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The server's database doesn't have clan chat yet (migration 0013): nothing to load, poll or subscribe to. */
  const [unavailable, setUnavailable] = useState(false);
  const [connection, setConnection] = useState<Connection>("connecting");
  /** Where you had read up to when the chat opened, for the "new messages" line. */
  const [readAtOpen, setReadAtOpen] = useState<number | null>(null);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const loaded = useRef(false);
  const lastMarked = useRef(0);

  /** Add or update messages. A deletion always wins over an older copy that still has text. */
  const merge = useCallback((list: ChatMessage[]) => {
    if (!list.length) return;
    setById((prev) => {
      const next = new Map(prev);
      for (const m of list) {
        const old = next.get(m.id);
        next.set(m.id, old?.deleted && !m.deleted ? old : m);
      }
      return next;
    });
    const sent = new Set(list.map((m) => m.clientId).filter(Boolean));
    if (sent.size) setPending((p) => p.filter((x) => !sent.has(x.clientId)));
  }, []);

  const lastId = () => Math.max(0, ...byIdRef.current.keys());

  /**
   * Everything newer than what we have, a page at a time. After a reconnect, also the
   * newest page again, to pick up deletions made while we were away.
   */
  const resync = useCallback(async (afterReconnect = true) => {
    if (!loaded.current) return;
    try {
      for (let i = 0; i < 20; i++) {
        const page = await request<ChatPage>("GET", `${messagesPath(clanId)}?after=${lastId()}&limit=100`);
        merge(page.messages);
        if (!page.hasMore) break;
      }
      if (afterReconnect) merge((await request<ChatPage>("GET", messagesPath(clanId))).messages);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [clanId, merge]);

  // First page.
  const loadFirst = useCallback(async () => {
    setLoading(true);
    try {
      const page = await request<ChatPage>("GET", messagesPath(clanId));
      setById(new Map(page.messages.map((m) => [m.id, m])));
      setHasMore(page.hasMore);
      setReadAtOpen((r) => r ?? page.lastReadId);
      lastMarked.current = page.lastReadId;
      loaded.current = true;
      setError(null);
      setUnavailable(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setUnavailable(e instanceof ApiError && e.code === "migrations_missing");
    } finally {
      setLoading(false);
    }
  }, [clanId]);

  useEffect(() => {
    loaded.current = false;
    setById(new Map());
    setPending([]);
    setReadAtOpen(null);
    loadFirst();
  }, [loadFirst]);

  // Live updates.
  useEffect(() => {
    if (unavailable) return;
    if (!supabase) {
      setConnection("offline");
      return;
    }
    let first = true;
    let live = true;
    const channel = supabase
      .channel(`clan-chat:${clanId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clan_messages", filter: `clan_id=eq.${clanId}` }, (p) => {
        if (p.eventType === "DELETE") return; // Messages are only soft-deleted; a hard delete means the clan closed.
        merge([fromRow(p.new as Record<string, unknown>)]);
      })
      .subscribe((status) => {
        if (!live) return;
        if (status === "SUBSCRIBED") {
          setConnection("live");
          // Anything sent while we were connecting or offline.
          if (!first) resync();
          first = false;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("offline");
        }
      });
    const offline = () => setConnection("offline");
    window.addEventListener("offline", offline);
    return () => {
      live = false;
      window.removeEventListener("offline", offline);
      supabase?.removeChannel(channel);
    };
  }, [clanId, merge, resync, unavailable]);

  // Fallback: poll while the live connection is down, and check occasionally while it's up.
  useEffect(() => {
    if (unavailable) return;
    const ms = connection === "live" ? LIVE_CHECK_MS : OFFLINE_POLL_MS;
    const t = window.setInterval(() => !document.hidden && resync(connection !== "live"), ms);
    const onBack = () => !document.hidden && resync();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [connection, resync, unavailable]);

  const loadOlder = useCallback(async () => {
    const first = Math.min(...byIdRef.current.keys());
    if (!Number.isFinite(first) || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await request<ChatPage>("GET", `${messagesPath(clanId)}?before=${first}`);
      merge(page.messages);
      setHasMore(page.hasMore);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't load older messages.", "err");
    } finally {
      setLoadingOlder(false);
    }
  }, [clanId, merge, loadingOlder, toast]);

  const post = useCallback(
    async (p: Pending) => {
      try {
        merge([await request<ChatMessage>("POST", messagesPath(clanId), { body: p.body, clientId: p.clientId })]);
        return true;
      } catch (e) {
        setPending((list) => list.map((x) => (x.clientId === p.clientId ? { ...x, failed: true } : x)));
        toast(e instanceof Error ? e.message : "Couldn't send.", "err");
        return false;
      }
    },
    [clanId, merge, toast]
  );

  /** Show it right away, then send. Same client id on retry, so it never posts twice. */
  const send = useCallback(
    (body: string) => {
      const p: Pending = { clientId: newClientId(), body, createdAt: new Date().toISOString(), failed: false };
      setPending((list) => [...list, p]);
      return post(p);
    },
    [post]
  );
  const retry = useCallback(
    (clientId: string) => {
      const p = pending.find((x) => x.clientId === clientId);
      if (!p) return;
      setPending((list) => list.map((x) => (x.clientId === clientId ? { ...x, failed: false } : x)));
      post(p);
    },
    [pending, post]
  );
  const discard = useCallback((clientId: string) => setPending((list) => list.filter((x) => x.clientId !== clientId)), []);

  const remove = useCallback(
    async (id: number) => {
      try {
        merge([await request<ChatMessage>("DELETE", `${messagesPath(clanId)}/${id}`)]);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't delete that.", "err");
      }
    },
    [clanId, merge, toast]
  );

  /** Tell the server you've read up to here (only ever forwards), and let the unread badges know. */
  const markRead = useCallback(
    async (id: number) => {
      if (id <= lastMarked.current) return;
      lastMarked.current = id;
      try {
        await request("POST", `/social/clans/${encodeURIComponent(clanId)}/read`, { messageId: id });
        window.dispatchEvent(new Event(CHAT_READ_EVENT));
      } catch {
        lastMarked.current = 0; // Try again next time.
      }
    },
    [clanId]
  );

  const messages = useMemo(() => [...byId.values()].sort((a, b) => a.id - b.id), [byId]);
  return { messages, pending, hasMore, loading, loadingOlder, error, unavailable, connection, readAtOpen, loadOlder, send, retry, discard, remove, markRead, reload: loadFirst };
}

/** Unread messages in your clan's chat, for badges. Checks every so often and right after you read. */
export function useChatUnread() {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      request<ChatStatus>("GET", "/social/chat")
        .then((s) => live && setStatus(s))
        .catch(() => {});
    load();
    const t = window.setInterval(() => !document.hidden && load(), 15_000);
    window.addEventListener(CHAT_READ_EVENT, load);
    document.addEventListener("visibilitychange", load);
    return () => {
      live = false;
      window.clearInterval(t);
      window.removeEventListener(CHAT_READ_EVENT, load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);
  return status?.unread ?? 0;
}
