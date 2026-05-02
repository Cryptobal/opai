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

const bodySchema = z.object({
  title: z.string().min(3).max(200).optional(),
});

/**
 * POST /api/vra/reports/from-visit/[visitId]
 * Crea un VraReport desde una visita técnica del supervisor (visit_type='vulnerability_assessment'
 * o regular). Importa AUTOMÁTICAMENTE todos los findings y todas las photos de la visita
 * a las tablas vra.report_findings y vra.report_photos. NO ejecuta el pipeline IA — eso lo
 * dispara el cliente con un POST a /generate después.
 *
 * Idempotente: si ya existe un VraReport para esta visita, lo retorna sin duplicar.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { visitId } = await params;

    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const visit = await prisma.opsVisitaSupervision.findFirst({
      where: { id: visitId, tenantId: ctx.tenantId },
      include: {
        installation: { select: { id: true, name: true } },
      },
    });
    if (!visit) {
      return NextResponse.json({ success: false, error: "Visita no encontrada" }, { status: 404 });
    }

    // Idempotencia: si ya hay un report para esta visita, devolverlo
    const existing = await prisma.vraReport.findFirst({
      where: { tenantId: ctx.tenantId, visitId, status: { not: "archived" } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: true, report: existing, alreadyExisted: true });
    }

    const title = parsed.data.title ?? `Informe de Vulnerabilidad — ${visit.installation.name}`;

    // Crear el report
    const report = await prisma.vraReport.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: visit.installationId,
        visitId,
        title,
        status: "draft",
        createdBy: ctx.userId,
      },
    });

    // Importar findings de la visita
    const findings = await prisma.opsSupervisionFinding.findMany({
      where: { visitId, tenantId: ctx.tenantId },
      orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
    });

    let importedFindings = 0;
    let order = 10;
    for (const f of findings) {
      await prisma.vraReportFinding.create({
        data: {
          reportId: report.id,
          description: f.description,
          severity: SEVERITY_MAP[f.severity?.toLowerCase()] ?? "medium",
          location: f.location ?? null,
          sectorTag: f.sectorTag ?? null,
          category: f.category ?? null,
          aggravatingFactors: f.aggravatingFactors ?? null,
          importedFromFindingId: f.id,
          sortOrder: order,
          createdBy: ctx.userId,
        },
      });
      order += 10;
      importedFindings++;
    }

    // Importar fotos de la visita
    const photos = await prisma.opsSupervisionPhoto.findMany({
      where: { visitId, tenantId: ctx.tenantId },
      orderBy: { takenAt: "desc" },
      include: { category: { select: { name: true } } },
    });

    let importedPhotos = 0;
    order = 10;
    for (const p of photos) {
      await prisma.vraReportPhoto.create({
        data: {
          reportId: report.id,
          storageKey: p.storageKey,
          publicUrl: p.photoUrl,
          fileName: p.fileName ?? null,
          mimeType: p.mimeType ?? null,
          fileSize: p.size ?? null,
          caption: p.category?.name ?? p.categoryName ?? null,
          gpsLat: p.gpsLat ? Number(p.gpsLat) : null,
          gpsLng: p.gpsLng ? Number(p.gpsLng) : null,
          takenAt: p.takenAt ?? null,
          importedFromVisitId: visitId,
          importedFromPhotoId: p.id,
          sortOrder: order,
          createdBy: ctx.userId,
        },
      });
      order += 10;
      importedPhotos++;
    }

    return NextResponse.json({
      success: true,
      report,
      importedFindings,
      importedPhotos,
      alreadyExisted: false,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] from-visit error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
