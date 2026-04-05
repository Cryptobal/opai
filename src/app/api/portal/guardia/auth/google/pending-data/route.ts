import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const pending = cookieStore.get("google_pending_registration");

  if (!pending?.value) {
    return NextResponse.json({ success: false });
  }

  try {
    const googleData = JSON.parse(pending.value);
    // Delete the cookie after reading
    const response = NextResponse.json({ success: true, googleData });
    response.cookies.set({
      name: "google_pending_registration",
      value: "",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ success: false });
  }
}
