import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, NavLink } from "react-router-dom";
import { Shell } from "../components/Shell.tsx";
import { ConfirmButton, Empty, Panel, PersonAvatar } from "../components/ui.tsx";
import { MAX_MESSAGE, charCount, useChatUnread, useClanChat, type Pending } from "../lib/chat.ts";
import { useSocial } from "../lib/social.tsx";
import { useStore } from "../lib/store.tsx";
import type { ChatMessage, Clan } from "../lib/types.ts";

/** Tabs at the top of the clan screens. */
export function ClanTabs() {
  const unread = useChatUnread();
  return (
    <nav className="tabs" aria-label="Clan">
      <NavLink to="/clans" end>
        Clan
      </NavLink>
      <NavLink to="/clans/chat">
        Chat
        {unread > 0 && <b aria-label={`${unread} unread`}>{unread > 99 ? "99+" : unread}</b>}
      </NavLink>
    </nav>
  );
}

const EMOJI = ["😀", "😂", "🔥", "👍", "🎉", "😬", "🙏", "💀", "🏆", "🎲", "💰", "👀"];
/** Within this many pixels of the bottom counts as "at the bottom": new messages scroll into view. */
const NEAR_BOTTOM = 120;
/** Messages from the same person this close together share one name and picture. */
const GROUP_MS = 5 * 60_000;

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function day(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** /clans/chat: your clan's chat. */
export default function ClanChat() {
  const { data, error } = useSocial();
  const clan = data?.clan;
  return (
    <Shell crumbs={[{ label: "Clans", to: "/clans" }, { label: "Chat" }]} fill>
      {!data ? (
        <Panel>
          <Empty title={error ? "Couldn't load your clan" : "Loading…"}>{error}</Empty>
        </Panel>
      ) : !clan ? (
        <Panel>
          <Empty title="You're not in a clan">
            Each clan has its own private chat.{" "}
            <Link to="/clans" className="red-t">
              Start or join a clan
            </Link>
          </Empty>
        </Panel>
      ) : (
        <>
          <ClanTabs />
          <Chat key={clan.id} clan={clan} />
        </>
      )}
    </Shell>
  );
}

function Chat({ clan }: { clan: Clan }) {
  const { me } = useStore();
  const chat = useClanChat(clan.id);
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevLast = useRef<number | null>(null);
  const prevHeight = useRef(0);
  const prevFirst = useRef<number | null>(null);
  const [below, setBelow] = useState(0);

  const members = new Map(clan.members.map((m) => [m.id, m]));
  const avatarOf = (m: ChatMessage) => (m.userId && members.get(m.userId)?.avatarUrl) || m.authorAvatar;
  const nameOf = (m: ChatMessage) => (m.userId && members.get(m.userId)?.name) || m.authorName || "Someone";

  const toBottom = useCallback((smooth = false) => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setBelow(0);
  }, []);

  const lastId = chat.messages.at(-1)?.id ?? null;
  const firstId = chat.messages[0]?.id ?? null;
  const lastMine = chat.messages.at(-1)?.userId === me;

  // Keep the view steady: older messages added above keep your place; new ones at the
  // bottom scroll into view if you were already there (or sent them), otherwise they're counted.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (prevFirst.current !== null && firstId !== null && firstId < prevFirst.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (lastId !== prevLast.current || chat.pending.length) {
      if (prevLast.current === null || atBottom.current || lastMine) toBottom();
      else if (lastId !== null && lastId > prevLast.current) {
        const since = prevLast.current;
        const fresh = chat.messages.filter((m) => m.id > since && m.userId !== me).length;
        if (fresh) setBelow((n) => n + fresh);
      }
    }
    prevFirst.current = firstId;
    prevLast.current = lastId;
    prevHeight.current = el.scrollHeight;
  }, [firstId, lastId, lastMine, chat.pending.length, chat.messages, me, toBottom]);

  // Read receipts for the unread badges: when you can see the bottom of the chat.
  useEffect(() => {
    if (lastId !== null && atBottom.current && !document.hidden) chat.markRead(lastId);
  }, [lastId, chat]);

  const onScroll = () => {
    const el = list.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (atBottom.current) {
      setBelow(0);
      if (lastId !== null) chat.markRead(lastId);
    }
    if (el.scrollTop < 40 && chat.hasMore && !chat.loadingOlder) chat.loadOlder();
  };

  // The "new messages" line goes above the first message from someone else that arrived after you last read.
  const firstUnread = chat.readAtOpen === null ? null : chat.messages.find((m) => m.id > chat.readAtOpen! && m.userId !== me && m.kind === "text")?.id;

  return (
    <section className="chat panel" aria-label={`${clan.name} chat`}>
      <header className="chat-head">
        <div style={{ minWidth: 0 }}>
          <b className="bright">{clan.name}</b>
          <span className="dim"> · {clan.members.length} member{clan.members.length === 1 ? "" : "s"}</span>
        </div>
        <span className={`conn ${chat.connection}`} role="status">
          <i aria-hidden />
          {chat.connection === "live" ? "Live" : chat.connection === "connecting" ? "Connecting…" : "Reconnecting…"}
        </span>
      </header>

      {chat.connection === "offline" && !chat.loading && (
        <div className="chat-banner" role="status">
          You're offline from live updates. New messages still arrive every few seconds, and you can keep sending.
        </div>
      )}

      <div className="chat-list" ref={list} onScroll={onScroll} aria-live="polite" aria-relevant="additions">
        {chat.loading ? (
          <Empty title="Loading messages…" />
        ) : chat.error && chat.messages.length === 0 ? (
          <Empty title="Couldn't load the chat">
            {chat.error}{" "}
            <button type="button" className="btn sm" onClick={chat.reload}>
              Try again
            </button>
          </Empty>
        ) : (
          <>
            {chat.hasMore ? (
              <button type="button" className="btn ghost sm chat-older" onClick={chat.loadOlder} disabled={chat.loadingOlder}>
                {chat.loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            ) : (
              chat.messages.length > 0 && <p className="chat-start">This is the start of {clan.name}'s chat.</p>
            )}
            {chat.messages.map((m, i) => {
              const prev = chat.messages[i - 1];
              const newDay = !prev || day(prev.createdAt) !== day(m.createdAt);
              const grouped =
                !newDay && prev && prev.kind === "text" && m.kind === "text" && prev.userId === m.userId &&
                Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS && m.id !== firstUnread;
              return (
                <div key={m.id}>
                  {newDay && <div className="chat-day">{day(m.createdAt)}</div>}
                  {m.id === firstUnread && <div className="chat-unread">New messages</div>}
                  {m.kind === "system" ? (
                    <div className="chat-system">
                      {m.body} <span className="dim">· {time(m.createdAt)}</span>
                    </div>
                  ) : (
                    <Bubble m={m} mine={m.userId === me} grouped={!!grouped} name={nameOf(m)} avatar={avatarOf(m)} onDelete={() => chat.remove(m.id)} />
                  )}
                </div>
              );
            })}
            {chat.pending.map((p) => (
              <PendingBubble key={p.clientId} p={p} onRetry={() => chat.retry(p.clientId)} onDiscard={() => chat.discard(p.clientId)} />
            ))}
            {chat.messages.filter((m) => m.kind === "text").length === 0 && chat.pending.length === 0 && (
              <div className="chat-empty">
                <b>No messages yet</b>
                <span>Say hi to your clan 👋</span>
              </div>
            )}
          </>
        )}
      </div>

      {below > 0 && (
        <button type="button" className="chat-jump" onClick={() => toBottom(true)}>
          ↓ {below} new message{below === 1 ? "" : "s"}
        </button>
      )}

      <Composer onSend={chat.send} disabled={chat.loading} />
    </section>
  );
}

function Bubble({ m, mine, grouped, name, avatar, onDelete }: { m: ChatMessage; mine: boolean; grouped: boolean; name: string; avatar: string | null; onDelete: () => void }) {
  return (
    <div className={`msg ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`} data-id={m.id}>
      {!mine && <span className="msg-av">{!grouped && <PersonAvatar name={name} url={avatar} />}</span>}
      <div className="msg-col">
        {!grouped && (
          <div className="msg-meta">
            {!mine && <b>{name}</b>}
            <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
          </div>
        )}
        <div className={`msg-body ${m.deleted ? "deleted" : ""}`}>{m.deleted ? "Message deleted" : m.body}</div>
        {mine && !m.deleted && (
          <ConfirmButton className="msg-del" label="Delete" confirm="Delete for everyone?" onConfirm={onDelete} />
        )}
      </div>
    </div>
  );
}

function PendingBubble({ p, onRetry, onDiscard }: { p: Pending; onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className={`msg mine pending ${p.failed ? "failed" : ""}`}>
      <div className="msg-col">
        <div className="msg-body">{p.body}</div>
        <div className="msg-meta">
          {p.failed ? (
            <>
              <span className="warn-t">Not sent.</span>
              <button type="button" className="linkish" onClick={onRetry}>
                Retry
              </button>
              <button type="button" className="linkish" onClick={onDiscard}>
                Discard
              </button>
            </>
          ) : (
            <span>Sending…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({ onSend, disabled }: { onSend: (body: string) => Promise<boolean>; disabled: boolean }) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const n = charCount(text);
  const empty = !text.trim();
  const tooLong = n > MAX_MESSAGE;
  // On phones Enter adds a line and the button sends; with a keyboard, Enter sends and Shift+Enter adds a line.
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

  // Grow with the text, up to about six lines.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [text]);

  const submit = () => {
    if (empty || tooLong || disabled) return;
    onSend(text.trim());
    setText("");
    setEmoji(false);
    box.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const insert = (s: string) => {
    const el = box.current;
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, at) + s + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + s.length, at + s.length);
    });
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {emoji && (
        <div className="emoji-row" role="group" aria-label="Emoji">
          {EMOJI.map((e) => (
            <button key={e} type="button" onClick={() => insert(e)} aria-label={`Insert ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="composer-row">
        <button type="button" className={`btn ghost sm emoji-btn ${emoji ? "on" : ""}`} onClick={() => setEmoji((v) => !v)} aria-label="Emoji" aria-expanded={emoji}>
          😀
        </button>
        <textarea
          ref={box}
          className="input"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Message your clan"
          aria-label="Message"
          enterKeyHint={touch ? "enter" : "send"}
        />
        <button className="btn primary" disabled={empty || tooLong || disabled}>
          Send
        </button>
      </div>
      {n > MAX_MESSAGE - 200 && (
        <p className={`hint ${tooLong ? "warn" : ""}`} role={tooLong ? "alert" : undefined}>
          {n.toLocaleString()} / {MAX_MESSAGE.toLocaleString()} characters
        </p>
      )}
    </form>
  );
}
