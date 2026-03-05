import { NextResponse } from "next/server";

const PORTAL_CLIENTE_SESSION_COOKIE = "portal_cliente_session";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set({
    name: PORTAL_CLIENTE_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return res;
}
