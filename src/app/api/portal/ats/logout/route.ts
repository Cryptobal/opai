import { NextResponse } from "next/server";
import { clearPortalCookie } from "@/lib/ats/portal-auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(clearPortalCookie());
  return response;
}
