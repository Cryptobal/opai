import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildClientReportData } from "@/lib/protocols/client-report";
import { renderClientReportPdf } from "@/lib/protocols/client-report-pdf";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { id: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver el reporte" },
        { status: 403 },
      );
    }

    const { id } = await params;

    // Multi-tenant guard: ensure the installation belongs to the caller's tenant.
    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    const data = await buildClientReportData(ctx.tenantId, id);
    if (!data) {
      return NextResponse.json(
        { success: false, error: "No se pudo generar el reporte" },
        { status: 404 },
      );
    }

    const buffer = await renderClientReportPdf(data);

    void logAudit({
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "EXPORT_DATA",
      entity: "ProtocolClientReport",
      entityId: id,
      details: { kind: "knowledge_report_downloaded", installationId: id },
      tenantId: ctx.tenantId,
      request,
    });

    const safeName = installation.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "reporte";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="reporte-${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[CLIENT-REPORT-PDF]", error);
    return NextResponse.json(
      { success: false, error: "Error generando el PDF" },
      { status: 500 },
    );
  }
}
