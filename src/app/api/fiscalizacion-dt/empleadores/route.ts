import { NextRequest, NextResponse } from "next/server";
import { requireDtSession } from "@/lib/fiscalizacion-dt/session";
import { listDtEmpleadores } from "@/lib/fiscalizacion-dt/empleadores";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireDtSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión expirada" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const data = await listDtEmpleadores(q);
  await logDtAccess({
    email: session.email,
    action: "list_employers",
    tenantId: session.tenantId,
    tenantRut: session.tenantRut,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: q ? { q } : null,
  });
  return NextResponse.json({ success: true, data });
}
