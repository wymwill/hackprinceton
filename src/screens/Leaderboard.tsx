"use client";

import Avatar from "@/components/Avatar";
import { useGroup } from "@/components/useGroup";
import { Loading, NotInGroup, card, label } from "@/components/ui";

export default function Leaderboard() {
  const { state, group, missing } = useGroup();
  if (missing) return <NotInGroup />;
  if (!group || !state) return <Loading />;
  const tokens = group.mode === "tokens";
  const rows = [...group.members].sort((a, b) => (tokens ? b.balance + b.positionValue - (a.balance + a.positionValue) : b.points - a.points));

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <h1 className="font-display text-headline-lg text-on-surface">Leaderboard</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">{tokens ? "Tokens on hand plus what your open positions are worth right now." : "Points from right calls. Going against the crowd pays more."}</p>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full font-body-md text-body-md min-w-[560px]">
          <thead>
            <tr className={label}>
              <th className="text-left font-semibold p-3 w-12">#</th>
              <th className="text-left font-semibold p-3">Who</th>
              <th className="text-right font-semibold p-3">{tokens ? "Total" : "Points"}</th>
              <th className="text-right font-semibold p-3">Record</th>
              <th className="text-right font-semibold p-3">Streak</th>
              <th className="text-right font-semibold p-3">Dares done</th>
              <th className="text-right font-semibold p-3">Skipped</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.userId} className={`border-t border-[#3a3645] ${m.userId === state.me ? "bg-primary-container/[0.06]" : ""}`}>
                <td className="p-3 font-num text-on-surface-variant">{i === 0 ? "👑" : i + 1}</td>
                <td className="p-3">
                  <span className="flex items-center gap-2">
                    <Avatar name={m.name} size={28} />
                    <span className="text-on-surface">{m.name}</span>
                    {m.role === "owner" && <span className="font-label-sm text-[10px] text-on-surface-variant">owner</span>}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <span className="font-num text-on-surface">{(tokens ? m.balance + m.positionValue : m.points).toLocaleString()}</span>
                  {tokens && m.positionValue > 0 && <span className="block font-label-sm text-[10px] text-on-surface-variant">{m.positionValue} in play</span>}
                </td>
                <td className="p-3 text-right font-num">
                  <span className="text-primary">{m.record.wins}</span>
                  <span className="text-on-surface-variant">–</span>
                  <span className="text-secondary">{m.record.losses}</span>
                </td>
                <td className={`p-3 text-right font-num ${m.streak > 0 ? "text-primary" : m.streak < 0 ? "text-secondary" : "text-on-surface-variant"}`}>
                  {m.streak > 0 ? `🔥 W${m.streak}` : m.streak < 0 ? `L${-m.streak}` : "–"}
                </td>
                <td className="p-3 text-right font-num text-on-surface">{m.dares.done}</td>
                <td className={`p-3 text-right font-num ${m.dares.skipped ? "text-secondary" : "text-on-surface-variant"}`}>{m.dares.skipped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
