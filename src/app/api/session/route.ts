import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { USER_COOKIE, errorResponse, readJson } from "@/server/http";
import { read } from "@/server/store";

/** Switch who you're playing as. Body: { userId } */
export async function POST(req: Request) {
  try {
    const { userId } = await readJson(req);
    const exists = await read((db) => db.users.some((u) => u.id === userId));
    if (!exists) throw new AppError(400, "unknown_user", "Nobody with that id.");
    const res = NextResponse.json({ result: { userId } });
    res.cookies.set(USER_COOKIE, String(userId), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
