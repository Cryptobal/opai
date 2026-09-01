import { NextResponse } from "next/server";
import { clearDtSessionCookie, requireDtSession } from "@/lib/fiscalizacion-dt/session";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";
import { getAppVersion, PROVIDER_DISPLAY_NAME } from "@/lib/app-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireDtSession();
  return NextResponse.json({
    success: true,
    provider: PROVIDER_DISPLAY_NAME,
    version: getAppVersion(),
    session: session
      ? {
          email: session.email,
          tenantId: session.tenantId,
          tenantRut: session.tenantRut,
          expiresAt: session.expiresAt.toISOString(),
        }
      : null,
  });
}

export async function DELETE(request: Request) {
  const session = await requireDtSession();
  if (session) {
    await logDtAccess({
      email: session.email,
      action: "logout",
      tenantId: session.tenantId,
      tenantRut: session.tenantRut,
      ip: getRequestIp(request),
      userAgent: getRequestUserAgent(request),
    });
  }
  await clearDtSessionCookie();
  return NextResponse.json({ success: true });
}
