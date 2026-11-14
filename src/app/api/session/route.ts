import { NextResponse } from "next/server";
import { authMode } from "@/lib/authConfig";
import { DEMO_COOKIE } from "@/server/auth";
import { AppError } from "@/server/errors";
import { errorResponse, readJson } from "@/server/http";
import { read } from "@/server/store";

/**
 * Demo mode only: switch who you're playing as. Body: { userId }
 * With real sign-in this is refused, so nobody can act as someone else.
 */
export async function POST(req: Request) {
  try {
    if (authMode() !== "demo") throw new AppError(403, "demo_only", "You can only play as yourself. Sign out to switch accounts.");
    const { userId } = await readJson(req);
    const exists = await read((db) => db.users.some((u) => u.id === userId));
    if (!exists) throw new AppError(400, "unknown_user", "Nobody with that id.");
    const res = NextResponse.json({ result: { userId } });
    res.cookies.set(DEMO_COOKIE, String(userId), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
