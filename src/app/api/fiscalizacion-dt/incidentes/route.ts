import { NextRequest, NextResponse } from "next/server";
import { requireDtSession } from "@/lib/fiscalizacion-dt/session";
import { INCIDENTES_COLUMNS, listDtIncidentesTecnicos } from "@/lib/fiscalizacion-dt/incidentes";
import { tableToExcelBuffer } from "@/modules/reportes-dt/export-excel";
import { simpleTablePdfBuffer } from "@/modules/reportes-dt/export-pdf";
import { simpleTableWordBuffer } from "@/modules/reportes-dt/export-word";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";
import { EMPTY_INCIDENTES_MESSAGE } from "@/modules/reportes-dt/constants";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireDtSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión expirada" }, { status: 401 });
  }

  const rows = await listDtIncidentesTecnicos();
  const format = (request.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  if (format === "json") {
    await logDtAccess({
      email: session.email,
      action: "view_incidentes",
      tenantId: session.tenantId,
      tenantRut: session.tenantRut,
      ip,
      userAgent,
    });
    return NextResponse.json({
      success: true,
      data: { columns: INCIDENTES_COLUMNS, rows, empty: rows.length === 0, emptyMessage: EMPTY_INCIDENTES_MESSAGE },
    });
  }

  await logDtAccess({
    email: session.email,
    action: "export_incidentes",
    tenantId: session.tenantId,
    tenantRut: session.tenantRut,
    ip,
    userAgent,
    meta: { format },
  });

  const title = "Reporte de incidentes técnicos";
  if (format === "xlsx") {
    const buf = await tableToExcelBuffer(title, INCIDENTES_COLUMNS, rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="incidentes-tecnicos.xlsx"',
      },
    });
  }
  if (format === "pdf") {
    const buf = await simpleTablePdfBuffer(title, INCIDENTES_COLUMNS, rows, EMPTY_INCIDENTES_MESSAGE);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="incidentes-tecnicos.pdf"',
      },
    });
  }
  if (format === "docx") {
    const buf = await simpleTableWordBuffer(title, INCIDENTES_COLUMNS, rows, EMPTY_INCIDENTES_MESSAGE);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="incidentes-tecnicos.docx"',
      },
    });
  }
  return NextResponse.json({ success: false, error: "Formato no soportado" }, { status: 400 });
}
