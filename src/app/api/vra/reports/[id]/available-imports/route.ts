import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/vra/reports/[id]/available-imports
 * Devuelve las visitas técnicas de la instalación con sus findings y fotos
 * disponibles para importar al informe. Excluye lo ya importado.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, installationId: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }

    // Findings ya importados (para excluir)
    const importedFindings = await prisma.vraReportFinding.findMany({
      where: { reportId: id, importedFromFindingId: { not: null } },
      select: { importedFromFindingId: true },
    });
    const importedFindingIds = new Set(
      importedFindings.map((f) => f.importedFromFindingId).filter(Boolean) as string[],
    );

    // Photos ya importadas
    const importedPhotos = await prisma.vraReportPhoto.findMany({
      where: { reportId: id, importedFromPhotoId: { not: null } },
      select: { importedFromPhotoId: true },
    });
    const importedPhotoIds = new Set(
      importedPhotos.map((p) => p.importedFromPhotoId).filter(Boolean) as string[],
    );

    // Últimas 10 visitas a la instalación
    const visits = await prisma.opsVisitaSupervision.findMany({
      where: { tenantId: ctx.tenantId, installationId: report.installationId },
      orderBy: { checkInAt: "desc" },
      take: 10,
      select: {
        id: true,
        checkInAt: true,
        checkOutAt: true,
        status: true,
        visitType: true,
        supervisor: { select: { name: true } },
      },
    });

    if (visits.length === 0) {
      return NextResponse.json({ success: true, visits: [] });
    }

    const visitIds = visits.map((v) => v.id);

    const allFindings = await prisma.opsSupervisionFinding.findMany({
      where: { visitId: { in: visitIds } },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        visitId: true,
        category: true,
        severity: true,
        description: true,
        photoUrl: true,
        occurrenceCount: true,
      },
    });

    const allPhotos = await prisma.opsSupervisionPhoto.findMany({
      where: { visitId: { in: visitIds } },
      orderBy: { takenAt: "desc" },
      select: {
        id: true,
        visitId: true,
        photoUrl: true,
        storageKey: true,
        categoryName: true,
        gpsLat: true,
        gpsLng: true,
        takenAt: true,
        category: { select: { name: true } },
      },
    });

    const enriched = visits.map((v) => ({
      id: v.id,
      checkInAt: v.checkInAt,
      checkOutAt: v.checkOutAt,
      status: v.status,
      visitType: v.visitType,
      supervisorName: v.supervisor?.name ?? null,
      findings: allFindings
        .filter((f) => f.visitId === v.id)
        .map((f) => ({
          ...f,
          alreadyImported: importedFindingIds.has(f.id),
        })),
      photos: allPhotos
        .filter((p) => p.visitId === v.id)
        .map((p) => ({
          id: p.id,
          publicUrl: p.photoUrl,
          storageKey: p.storageKey,
          categoryName: p.category?.name ?? p.categoryName,
          gpsLat: p.gpsLat ? Number(p.gpsLat) : null,
          gpsLng: p.gpsLng ? Number(p.gpsLng) : null,
          takenAt: p.takenAt,
          alreadyImported: importedPhotoIds.has(p.id),
        })),
    }));

    return NextResponse.json({ success: true, visits: enriched });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
