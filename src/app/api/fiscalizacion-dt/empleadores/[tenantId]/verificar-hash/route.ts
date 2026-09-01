import { NextRequest, NextResponse } from "next/server";
import { requireMatchingDtTenant } from "@/lib/fiscalizacion-dt/require-tenant";
import { verifyMarcacionByStoredHash } from "@/lib/fiscalizacion-dt/verify-hash";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const authz = await requireMatchingDtTenant(tenantId);
  if ("error" in authz) return authz.error;

  const hash = request.nextUrl.searchParams.get("hash") ?? "";
  if (!hash.trim()) {
    return NextResponse.json({ success: false, error: "Indique el hash de la marcación" }, { status: 400 });
  }

  const data = await verifyMarcacionByStoredHash(authz.session.tenantId, hash);
  await logDtAccess({
    email: authz.session.email,
    action: "verify_hash",
    tenantId: authz.session.tenantId,
    tenantRut: authz.session.tenantRut,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: { found: Boolean(data) },
  });

  if (!data) {
    return NextResponse.json({ success: false, error: "Marcación no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data });
}
