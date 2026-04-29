import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const SEVERITY_MAP: Record<string, string> = {
  critical: "critical",
  major: "high",
  high: "high",
  medium: "medium",
  minor: "low",
  low: "low",
};

const importSchema = z.object({
  findingIds: z.array(z.string().uuid()).default([]),
  photoIds: z.array(z.string().uuid()).default([]),
});

/**
 * POST /api/vra/reports/[id]/import-from-visit
 * Importa findings y/o fotos seleccionados desde una o más visitas técnicas.
 * Se duplican como nuevas filas en vra.report_findings y vra.report_photos
 * con la trazabilidad importedFromFindingId / importedFromPhotoId.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const parsed = await parseBody(request, importSchema);
    if (parsed.error) return parsed.error;
    const { findingIds, photoIds } = parsed.data;

    const findings = findingIds.length > 0
      ? await prisma.opsSupervisionFinding.findMany({
          where: {
            id: { in: findingIds },
            tenantId: ctx.tenantId,
            installationId: report.installationId,
          },
        })
      : [];

    const photos = photoIds.length > 0
      ? await prisma.opsSupervisionPhoto.findMany({
          where: {
            id: { in: photoIds },
            tenantId: ctx.tenantId,
            visit: { installationId: report.installationId },
          },
          include: { category: { select: { name: true } } },
        })
      : [];

    let importedFindings = 0;
    let importedPhotos = 0;

    if (findings.length > 0) {
      const lastOrder = await prisma.vraReportFinding.findFirst({
        where: { reportId: id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      let sortOrder = (lastOrder?.sortOrder ?? -10) + 10;

      for (const f of findings) {
        // Skip si ya fue importado
        const exists = await prisma.vraReportFinding.findFirst({
          where: { reportId: id, importedFromFindingId: f.id },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.vraReportFinding.create({
          data: {
            reportId: id,
            description: f.description,
            severity: SEVERITY_MAP[f.severity?.toLowerCase()] ?? "medium",
            category: f.category ?? null,
            importedFromFindingId: f.id,
            sortOrder,
            createdBy: ctx.userId,
          },
        });
        sortOrder += 10;
        importedFindings++;
      }
    }

    if (photos.length > 0) {
      const lastOrder = await prisma.vraReportPhoto.findFirst({
        where: { reportId: id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      let sortOrder = (lastOrder?.sortOrder ?? -10) + 10;

      for (const p of photos) {
        const exists = await prisma.vraReportPhoto.findFirst({
          where: { reportId: id, importedFromPhotoId: p.id },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.vraReportPhoto.create({
          data: {
            reportId: id,
            storageKey: p.storageKey,
            publicUrl: p.photoUrl,
            fileName: null,
            mimeType: p.mimeType ?? null,
            fileSize: p.size ?? null,
            caption: null,
            gpsLat: p.gpsLat ? Number(p.gpsLat) : null,
            gpsLng: p.gpsLng ? Number(p.gpsLng) : null,
            takenAt: p.takenAt ?? null,
            importedFromVisitId: p.visitId,
            importedFromPhotoId: p.id,
            sortOrder,
            createdBy: ctx.userId,
          },
        });
        sortOrder += 10;
        importedPhotos++;
      }
    }

    return NextResponse.json({
      success: true,
      importedFindings,
      importedPhotos,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] import-from-visit error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
