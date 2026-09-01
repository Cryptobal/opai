import { NextRequest, NextResponse } from "next/server";
import { requireDtSession } from "@/lib/fiscalizacion-dt/session";
import { listDtClientesArt26 } from "@/lib/fiscalizacion-dt/clientes";
import { clientesToExcelBuffer } from "@/modules/reportes-dt/export-excel";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireDtSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión expirada" }, { status: 401 });
  }

  const data = await listDtClientesArt26();
  const format = (request.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  if (format === "xlsx") {
    await logDtAccess({
      email: session.email,
      action: "export_clientes",
      tenantId: session.tenantId,
      tenantRut: session.tenantRut,
      ip,
      userAgent,
    });
    const buf = await clientesToExcelBuffer(data);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="clientes-art26.xlsx"',
      },
    });
  }

  await logDtAccess({
    email: session.email,
    action: "view_clientes",
    tenantId: session.tenantId,
    tenantRut: session.tenantRut,
    ip,
    userAgent,
  });
  return NextResponse.json({ success: true, data });
}
