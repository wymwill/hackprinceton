import "server-only";
import type { NextRequest } from "next/server";
import { authMode } from "@/lib/authConfig";
import { AppError } from "./errors";
import { newId, type Db } from "./store";
import { serverSupabase } from "./supabase";

/**
 * Who is calling. Worked out once per request, before the database lock.
 *
 * In "supabase" mode the only source is the verified Supabase session: the
 * old `bwf_user` cookie is ignored, and there is no fallback user. In "demo"
 * mode it's the "Playing as" cookie, as before.
 */
export type Identity = { kind: "supabase"; authId: string; name: string; avatarUrl?: string } | { kind: "demo"; userId?: string };

export const DEMO_COOKIE = "bwf_user";

const signedOut = () => new AppError(401, "signed_out", "Sign in to continue.");

export async function identify(req: NextRequest): Promise<Identity> {
  const mode = authMode();
  if (mode === "demo") return { kind: "demo", userId: req.cookies.get(DEMO_COOKIE)?.value };
  if (mode === "unconfigured") throw new AppError(503, "auth_not_configured", "Sign-in isn't set up on this server yet.");

  const supabase = await serverSupabase();
  if (!supabase) throw signedOut();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) throw signedOut();

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const email = str(claims.email);
  const name = (str(meta.display_name) ?? str(meta.full_name) ?? str(meta.name) ?? email?.split("@")[0] ?? "Friend").slice(0, 40);
  const avatar = str(meta.avatar_url) ?? str(meta.picture);
  return { kind: "supabase", authId: claims.sub, name, avatarUrl: avatar?.startsWith("https://") ? avatar : undefined };
}

/**
 * The app user for this identity, inside a transaction. A Supabase account is
 * linked to exactly one app user by its id (`authId`), created the first time
 * it signs in. Its name and photo follow the Google profile.
 */
export function userFor(db: Db, who: Identity): string {
  if (who.kind === "demo") {
    // Demo only: the switcher's choice, or the first user.
    return who.userId && db.users.some((u) => u.id === who.userId) ? who.userId : (db.users[0]?.id ?? "");
  }
  const existing = db.users.find((u) => u.authId === who.authId);
  if (existing) {
    if (existing.name !== who.name) existing.name = who.name;
    if (existing.avatarUrl !== who.avatarUrl) existing.avatarUrl = who.avatarUrl;
    return existing.id;
  }
  const id = newId("u");
  db.users.push({ id, name: who.name, authId: who.authId, avatarUrl: who.avatarUrl });
  return id;
}
