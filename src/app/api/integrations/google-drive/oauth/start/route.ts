import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildState,
  getDriveOAuthClient,
  DRIVE_SCOPES,
} from "@/lib/google-workspace";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.redirect(`${origin}/opai/login?callbackUrl=/opai/configuracion/integraciones/google-drive`);
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return NextResponse.redirect(
      `${origin}/opai/configuracion/integraciones/google-drive?drive=forbidden`,
    );
  }

  const client = getDriveOAuthClient();
  if (!client) {
    return NextResponse.redirect(
      `${origin}/opai/configuracion/integraciones/google-drive?drive=missing_env`,
    );
  }

  const state = buildState({
    tenantId: session.user.tenantId,
    userId: session.user.id,
  });
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...DRIVE_SCOPES],
    state,
  });
  return NextResponse.redirect(url);
}
