import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/authConfig";
import { serverSupabase } from "@/server/supabase";

/**
 * Google sends people back here after they sign in. Swap the one-time code
 * for a session (set as cookies), then continue to where they were going.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}&next=${encodeURIComponent(next)}`, req.url));

  // The provider reports cancellations and errors as query params.
  if (searchParams.get("error")) return fail(searchParams.get("error_description") ?? "Sign-in was cancelled.");
  if (!code) return fail("The sign-in link was incomplete. Try again.");

  const supabase = await serverSupabase();
  if (!supabase) return fail("Sign-in isn't set up on this server yet.");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("That sign-in link expired. Try again.");
  return NextResponse.redirect(new URL(next, req.url));
}
