import { NextRequest, NextResponse } from "next/server";
import { requireMatchingDtTenant } from "@/lib/fiscalizacion-dt/require-tenant";
import { loadDtFilterOptions } from "@/modules/reportes-dt/filter-options";
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

  const data = await loadDtFilterOptions(authz.session.tenantId);
  await logDtAccess({
    email: authz.session.email,
    action: "view_report",
    tenantId: authz.session.tenantId,
    tenantRut: authz.session.tenantRut,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: { tipo: "filtros" },
  });
  return NextResponse.json({ success: true, data });
}
