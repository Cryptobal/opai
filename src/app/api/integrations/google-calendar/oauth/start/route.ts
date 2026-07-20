import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildState,
  getCalendarOAuthClient,
  CALENDAR_SCOPES,
} from "@/lib/google-workspace";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.redirect(
      `${origin}/opai/login?callbackUrl=/opai/configuracion/integraciones/google-calendar`,
    );
  }

  const client = getCalendarOAuthClient();
  if (!client) {
    return NextResponse.redirect(
      `${origin}/opai/configuracion/integraciones/google-calendar?cal=missing_env`,
    );
  }

  const state = buildState({
    tenantId: session.user.tenantId,
    userId: session.user.id,
  });
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [...CALENDAR_SCOPES],
    state,
  });
  return NextResponse.redirect(url);
}
