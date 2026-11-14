"use client";

import { useParams } from "next/navigation";
import { useApp } from "./AppProvider";

/** The group in the URL, once its data has loaded. `missing` means you're not in it. */
export function useGroup() {
  const app = useApp();
  const params = useParams<{ groupId: string; marketId?: string }>();
  const { state } = app;
  const ready = !!state && state.group?.id === params.groupId;
  const missing = !!state && !state.groups.some((g) => g.id === params.groupId);
  return { ...app, groupId: params.groupId, marketId: params.marketId, group: ready ? state!.group! : null, ready, missing };
}
