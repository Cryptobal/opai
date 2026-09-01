import { NextRequest, NextResponse } from "next/server";
import { requireMatchingDtTenant } from "@/lib/fiscalizacion-dt/require-tenant";
import { parseDtFilters } from "@/modules/reportes-dt/filters";
import { buildDtReport } from "@/modules/reportes-dt/portal-reports";
import { reportToExcelBuffer } from "@/modules/reportes-dt/export-excel";
import { reportToPdfBuffer } from "@/modules/reportes-dt/export-pdf";
import { reportToWordBuffer } from "@/modules/reportes-dt/export-word";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIPOS = new Set([
  "asistencia",
  "jornada-diaria",
  "domingos-festivos",
  "modificaciones-turnos",
  "reporte-diario",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; tipo: string }> },
) {
  const { tenantId, tipo } = await params;
  const authz = await requireMatchingDtTenant(tenantId);
  if ("error" in authz) return authz.error;
  if (!TIPOS.has(tipo)) {
    return NextResponse.json({ success: false, error: "Tipo de reporte no válido" }, { status: 400 });
  }

  const filters = parseDtFilters(request.nextUrl.searchParams);
  const report = await buildDtReport(authz.session.tenantId, tipo, filters);
  const format = (request.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  if (format === "json") {
    await logDtAccess({
      email: authz.session.email,
      action: "view_report",
      tenantId: authz.session.tenantId,
      tenantRut: authz.session.tenantRut,
      ip,
      userAgent,
      meta: { tipo, from: report.from, to: report.to },
    });
    return NextResponse.json({ success: true, data: report });
  }

  await logDtAccess({
    email: authz.session.email,
    action: "export_report",
    tenantId: authz.session.tenantId,
    tenantRut: authz.session.tenantRut,
    ip,
    userAgent,
    meta: { tipo, format, from: report.from, to: report.to },
  });

  const base = `${tipo}-${report.from}-${report.to}`;
  if (format === "xlsx") {
    const buf = await reportToExcelBuffer(report);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }
  if (format === "pdf") {
    const buf = await reportToPdfBuffer(report);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
      },
    });
  }
  if (format === "docx") {
    const buf = await reportToWordBuffer(report);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${base}.docx"`,
      },
    });
  }

  return NextResponse.json({ success: false, error: "Formato no soportado" }, { status: 400 });
}
