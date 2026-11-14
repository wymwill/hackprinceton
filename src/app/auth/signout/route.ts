import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/server/supabase";

/**
 * Sign out and go to the login page. POST only, so a link or image can't sign
 * someone out. "local" ends this device's session before telling Supabase, so
 * signing out works even if that call fails; the session cookies are cleared
 * on the redirect as well.
 */
export async function POST(req: NextRequest) {
  const supabase = await serverSupabase();
  await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  for (const c of req.cookies.getAll()) if (c.name.startsWith("sb-")) res.cookies.delete(c.name);
  return res;
}
