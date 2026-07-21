import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildState,
  getCalendarOAuthClient,
  CALENDAR_SCOPES,
  safeCalendarReturnPath,
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

  const returnPath = safeCalendarReturnPath(
    new URL(request.url).searchParams.get("return"),
  );
  const state = buildState({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    ...(returnPath ? { returnPath } : {}),
  });
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    // include_granted_scopes se omite a propósito: con la cuenta ya
    // habiendo autorizado Opai para Gmail, la fusión de scopes previos
    // devolvía un token SIN calendar.events → 403 "insufficient scopes".
    // Forzar un consentimiento explícito y aislado garantiza el scope.
    login_hint: session.user.email ?? undefined,
    scope: [...CALENDAR_SCOPES],
    state,
  });
  return NextResponse.redirect(url);
}
