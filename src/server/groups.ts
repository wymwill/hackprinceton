import "server-only";
import { randomInt } from "node:crypto";
import type { GroupMode } from "@/lib/markets/types";
import { AppError } from "./errors";
import { newId, type Db, type Group } from "./store";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const DEFAULT_DARES = ["50 burpees on camera", "Wear a shirt the group picks", "Post an apology in the chat", "Cold shower, filmed", "Buy the winner a coffee"];

function inviteCode(db: Db) {
  for (;;) {
    let code = "";
    for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!db.groups.some((g) => g.inviteCode === code)) return code;
  }
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function addMember(db: Db, group: Group, userId: string, role: "owner" | "member", now: Date) {
  db.memberships.push({ groupId: group.id, userId, role, joinedAt: now.toISOString() });
  if (group.mode === "tokens") {
    db.ledger.push({ id: newId("l"), groupId: group.id, userId, kind: "grant", amount: group.startingBalance, createdAt: now.toISOString() });
  }
}

export function createGroup(
  db: Db,
  userId: string,
  input: { name?: unknown; emoji?: unknown; mode?: unknown; startingBalance?: unknown },
  now = new Date(),
  id?: string
) {
  const name = text(input.name);
  if (name.length < 2 || name.length > 40) throw new AppError(400, "bad_name", "Group names are 2 to 40 characters.");
  const mode = input.mode;
  if (mode !== "tokens" && mode !== "points") throw new AppError(400, "bad_mode", "Pick Tokens or Points.");
  const startingBalance = mode === "tokens" ? Number(input.startingBalance ?? 1000) : 0;
  if (mode === "tokens" && (!Number.isInteger(startingBalance) || startingBalance < 100 || startingBalance > 100000)) {
    throw new AppError(400, "bad_balance", "Starting balance is 100 to 100,000 tokens.");
  }
  const group: Group = {
    id: id ?? newId("g", 8),
    name,
    emoji: text(input.emoji).slice(0, 4) || "🎲",
    inviteCode: inviteCode(db),
    mode: mode as GroupMode,
    startingBalance,
    darePresets: [...DEFAULT_DARES],
    ownerId: userId,
    createdAt: now.toISOString(),
  };
  db.groups.push(group);
  addMember(db, group, userId, "owner", now);
  return group;
}

export function joinGroup(db: Db, userId: string, code: unknown, now = new Date()) {
  const c = text(code).toUpperCase();
  const group = db.groups.find((g) => g.inviteCode === c);
  if (!group) throw new AppError(404, "bad_code", "No group has that invite code.");
  if (db.memberships.some((m) => m.groupId === group.id && m.userId === userId)) throw new AppError(409, "already_member", "You're already in this group.");
  addMember(db, group, userId, "member", now);
  return group;
}

/**
 * What an invite link shows before you join: the group's name, emoji, mode and
 * members, and whether you're already in. The code itself is the secret, so
 * this reveals nothing to someone without it.
 */
export function invitePreview(db: Db, userId: string, code: unknown) {
  const c = text(code).toUpperCase();
  const group = db.groups.find((g) => g.inviteCode === c);
  if (!group) throw new AppError(404, "bad_code", "That invite link doesn't match any group.");
  const members = db.memberships.filter((m) => m.groupId === group.id).map((m) => db.users.find((u) => u.id === m.userId)?.name ?? m.userId);
  return {
    groupId: group.id,
    name: group.name,
    emoji: group.emoji,
    mode: group.mode,
    members,
    alreadyMember: db.memberships.some((m) => m.groupId === group.id && m.userId === userId),
  };
}

export function requireMember(db: Db, userId: string, groupId: string) {
  const group = db.groups.find((g) => g.id === groupId);
  const m = group && db.memberships.find((x) => x.groupId === groupId && x.userId === userId);
  if (!group || !m) throw new AppError(404, "group_not_found", "That group doesn't exist or you're not in it.");
  return { group, membership: m };
}

export const isLocked = (db: Db, groupId: string) => db.markets.some((m) => m.groupId === groupId);

export function updateGroup(db: Db, userId: string, groupId: string, patch: Record<string, unknown>) {
  const { group } = requireMember(db, userId, groupId);
  if (group.ownerId !== userId) throw new AppError(403, "not_owner", "Only the group owner can change settings.");
  if (("mode" in patch || "startingBalance" in patch) && isLocked(db, groupId)) {
    throw new AppError(409, "locked", "Currency is locked after the first market.");
  }
  if ("name" in patch) {
    const name = text(patch.name);
    if (name.length < 2 || name.length > 40) throw new AppError(400, "bad_name", "Group names are 2 to 40 characters.");
    group.name = name;
  }
  if ("emoji" in patch) group.emoji = text(patch.emoji).slice(0, 4) || group.emoji;
  if ("darePresets" in patch) {
    const list = Array.isArray(patch.darePresets) ? patch.darePresets.map(text).filter(Boolean) : null;
    if (!list || list.length > 10 || list.some((d) => d.length > 80)) throw new AppError(400, "bad_presets", "Up to 10 dares, 80 characters each.");
    group.darePresets = list;
  }
  if ("mode" in patch) {
    if (patch.mode !== "tokens" && patch.mode !== "points") throw new AppError(400, "bad_mode", "Pick Tokens or Points.");
    group.mode = patch.mode;
  }
  if ("startingBalance" in patch) {
    const n = Number(patch.startingBalance);
    if (!Number.isInteger(n) || n < 100 || n > 100000) throw new AppError(400, "bad_balance", "Starting balance is 100 to 100,000 tokens.");
    group.startingBalance = n;
  }
  if ("mode" in patch || "startingBalance" in patch) {
    // No markets yet, so the only rows are grants. Reissue them under the new rules.
    db.ledger = db.ledger.filter((r) => r.groupId !== groupId);
    if (group.mode === "tokens") {
      for (const m of db.memberships.filter((x) => x.groupId === groupId)) {
        db.ledger.push({ id: newId("l"), groupId, userId: m.userId, kind: "grant", amount: group.startingBalance, createdAt: new Date().toISOString() });
      }
    }
  }
  return group;
}

export const balanceIn = (db: Db, groupId: string, userId: string) =>
  db.ledger.reduce((sum, r) => (r.groupId === groupId && r.userId === userId ? sum + r.amount : sum), 0);
