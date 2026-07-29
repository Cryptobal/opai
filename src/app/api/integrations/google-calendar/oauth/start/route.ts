import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  buildState,
  getCalendarOAuthClient,
  CALENDAR_SCOPES,
  safeCalendarReturnPath,
} from "@/lib/google-workspace";
import { resolveMultiAccount } from "@/modules/shared/multi-account";

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

  const params = new URL(request.url).searchParams;
  const returnPath = safeCalendarReturnPath(params.get("return"));
  const dest =
    returnPath ?? "/opai/configuracion/integraciones/google-calendar";

  const multi = await resolveMultiAccount({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    scope: "agenda",
  });

  // Sin multicuenta: ignorar ?add=1 (no abrir selector de cuenta de Google).
  const wantsAdd = params.get("add") === "1";
  const addAccount = multi.flagEnabled && wantsAdd;

  if (!multi.canConnect) {
    return NextResponse.redirect(`${origin}${dest}?cal=limit_reached`);
  }

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
    // ?add=1 omite login_hint para que Google muestre el selector de cuenta.
    ...(addAccount ? {} : { login_hint: session.user.email ?? undefined }),
    scope: [...CALENDAR_SCOPES],
    state,
  });
  return NextResponse.redirect(url);
}
