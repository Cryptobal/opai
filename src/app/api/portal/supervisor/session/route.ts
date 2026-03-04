import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateSupervisorSession } from "@/lib/portal-supervisor";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sin sesión" }, { status: 401 });
  }

  const result = await validateSupervisorSession(session);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 403 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
