/**
 * Opt-in reminders (migration 0019), shown in Your moves. The server works out what's
 * due each time this asks, so a reminder appears once per action and is gone as soon
 * as the action is done. Nothing is sent outside the app.
 */
import { useCallback, useEffect, useState } from "react";
import { request, useStore } from "./store.tsx";
import type { Reminder, ReminderPrefs, ReminderState } from "./types.ts";

const POLL_MS = 30_000;
const CHANGED = "alea:reminders-changed";

/** The Your moves item a reminder is about (see todos.ts keys). */
export const reminderTodoKey = (r: Reminder) =>
  `${r.seriesId}:${r.kind === "closing_bet" ? "bet" : r.kind === "unresolved_result" ? "call" : "pick"}:${r.refId}`;

export function useReminders() {
  const { toast } = useStore();
  const [state, setState] = useState<ReminderState | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await request<ReminderState>("GET", "/notifications"));
    } catch {
      // Reminders are optional; the rest of the app works without them.
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(() => !document.hidden && load(), POLL_MS);
    const onVisible = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(CHANGED, load);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(CHANGED, load);
    };
  }, [load]);

  const setPrefs = useCallback(
    async (patch: Partial<ReminderPrefs>) => {
      // Show the change at once; put it back if the server doesn't take it.
      let before: ReminderPrefs | undefined;
      setState((s) => {
        before = s?.prefs;
        return s ? { ...s, prefs: { ...s.prefs, ...patch } } : s;
      });
      try {
        setState(await request<ReminderState>("PATCH", "/notifications/prefs", patch));
        window.dispatchEvent(new Event(CHANGED));
        return true;
      } catch (e) {
        if (before) {
          const prior = before;
          setState((s) => (s ? { ...s, prefs: prior } : s));
        }
        toast(e instanceof Error ? e.message : "Couldn't save your reminder settings.", "err");
        return false;
      }
    },
    [toast]
  );

  const markRead = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    try {
      await request("POST", "/notifications/read", { ids });
      setState((s) => (s ? { ...s, unread: Math.max(0, s.unread - ids.length), notifications: s.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) } : s));
    } catch {
      // They'll show as new again next time; harmless.
    }
  }, []);

  return { state, setPrefs, markRead };
}
