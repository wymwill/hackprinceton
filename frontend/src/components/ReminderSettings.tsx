import { useReminders } from "../lib/reminders.ts";
import type { ReminderPrefs } from "../lib/types.ts";
import { Panel } from "./ui.tsx";

const KINDS: { key: keyof ReminderPrefs; label: string; detail: string }[] = [
  { key: "closingBets", label: "Bets closing soon", detail: "A bet you haven't bet on closes within a day." },
  { key: "unresolvedResults", label: "Results to call", detail: "A bet you host has closed and needs its result." },
  { key: "punishmentPicks", label: "Punishments to pick", detail: "It's your turn to pick a punishment for someone." },
];

/** Opt in to reminders, one kind at a time. They show in Your moves; nothing is sent elsewhere. */
export function ReminderSettings() {
  const { state, setPrefs } = useReminders();
  return (
    <Panel label="Reminders">
      <div className="stack" style={{ gap: 10 }}>
        {KINDS.map((k) => (
          <label key={k.key} className="check">
            <input
              type="checkbox"
              checked={state?.prefs[k.key] ?? false}
              disabled={!state}
              onChange={(e) => setPrefs({ [k.key]: e.target.checked })}
            />
            <span>
              <b>{k.label}</b>
              <span className="dim" style={{ display: "block", fontSize: 13 }}>
                {k.detail}
              </span>
            </span>
          </label>
        ))}
        <p className="hint">
          Off until you turn them on. Reminders show in Your moves, once per thing to do, and go away when it's done. They
          aren't emailed.
        </p>
      </div>
    </Panel>
  );
}
