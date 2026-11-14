"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "./AppProvider";

/** Tells the provider which group the URL is on, so polling loads that group. */
export default function GroupSync() {
  const params = useParams<{ groupId?: string }>();
  const { setGroupId } = useApp();
  const id = params.groupId ?? null;
  useEffect(() => setGroupId(id), [id, setGroupId]);
  return null;
}
