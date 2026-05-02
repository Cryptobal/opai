import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/installations/[id]/vra-reports
 * Devuelve la vista UNIFICADA: informes VRA generados + DocOperacionales manuales
 * subidos al tipo "informe_vulnerabilidad". Ordenados por fecha desc.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id: installationId } = await params;

    const inst = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!inst) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const vraReports = await prisma.vraReport.findMany({
      where: { tenantId: ctx.tenantId, installationId, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        riskLevel: true,
        version: true,
        generatedAt: true,
        portalVisible: true,
        pdfUrl: true,
        publicToken: true,
        docOperacionalId: true,
        createdAt: true,
      },
    });

    const tipoDoc = await prisma.tipoDocOperacional.findFirst({
      where: { tenantId: ctx.tenantId, codigo: "informe_vulnerabilidad" },
      select: { id: true },
    });

    const linkedDocIds = new Set(
      vraReports.filter((r) => r.docOperacionalId).map((r) => r.docOperacionalId!),
    );
    const manualDocs = tipoDoc
      ? await prisma.docOperacional.findMany({
          where: {
            tenantId: ctx.tenantId,
            installationId,
            tipoId: tipoDoc.id,
            id: { notIn: Array.from(linkedDocIds) },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            issuedAt: true,
            expiresAt: true,
            status: true,
            portalClienteVisible: true,
            createdAt: true,
            notes: true,
          },
        })
      : [];

    const unified = [
      ...vraReports.map((r) => ({
        kind: "vra" as const,
        id: r.id,
        title: r.title,
        status: r.status,
        riskLevel: r.riskLevel,
        version: r.version,
        date: r.generatedAt ?? r.createdAt,
        pdfUrl: r.pdfUrl,
        publicToken: r.publicToken,
        portalVisible: r.portalVisible,
      })),
      ...manualDocs.map((d) => ({
        kind: "manual" as const,
        id: d.id,
        title: d.fileName,
        status: d.status,
        riskLevel: null,
        version: null,
        date: d.issuedAt ?? d.createdAt,
        pdfUrl: d.fileUrl,
        publicToken: null,
        portalVisible: d.portalClienteVisible,
        expiresAt: d.expiresAt,
        notes: d.notes,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ success: true, items: unified });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
