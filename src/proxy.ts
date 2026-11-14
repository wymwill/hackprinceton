import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authMode, safeNext, supabaseConfig } from "@/lib/authConfig";

/**
 * Runs before every page and API request.
 * - Keeps the Supabase session fresh, writing refreshed cookies onto the response.
 * - Sends signed-out visitors to /login, keeping where they were going in ?next=.
 *   API routes aren't redirected: their handlers answer 401 themselves.
 *
 * This is a convenience, not the security boundary. Every API handler checks
 * the session on its own (see identify in src/server/auth.ts).
 */
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "demo") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isAuthPage = pathname === "/login" || pathname.startsWith("/auth/");

  const toLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return url;
  };

  const config = supabaseConfig();
  if (mode === "unconfigured" || !config) return isApi || isAuthPage ? NextResponse.next() : NextResponse.redirect(toLogin());

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet, headers) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Verifies the JWT (and refreshes it when it's about to expire). Don't put code between this and the checks below.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;

  const redirect = (url: URL) => {
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  if (!signedIn && !isApi && !isAuthPage) return redirect(toLogin());
  if (signedIn && pathname === "/login") return redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  return response;
}

export const config = {
  // Everything except Next's assets and the public install files (manifest, icons).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-icon|icons/).*)"],
};
