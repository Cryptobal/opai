import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  installationId: z.string().uuid(),
  visitId: z.string().uuid().optional().nullable(),
  title: z.string().min(3).max(200).optional(),
});

/**
 * GET /api/vra/reports?installationId=...
 * Lista informes VRA del tenant, opcionalmente filtrados por instalación.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { searchParams } = new URL(request.url);
    const installationId = searchParams.get("installationId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (installationId) where.installationId = installationId;
    if (status) where.status = status;

    const reports = await prisma.vraReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        installation: { select: { id: true, name: true, address: true } },
        sections: { select: { id: true, status: true } },
      },
    });

    return NextResponse.json({ success: true, reports });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] list reports error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST /api/vra/reports
 * Crea un informe en estado draft (sin generación todavía).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, createSchema);
    if (parsed.error) return parsed.error;
    const { installationId, visitId, title } = parsed.data;

    const inst = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!inst) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    if (visitId) {
      const visit = await prisma.opsVisitaSupervision.findFirst({
        where: { id: visitId, tenantId: ctx.tenantId, installationId },
        select: { id: true },
      });
      if (!visit) {
        return NextResponse.json({ success: false, error: "Visita no encontrada o no pertenece a esta instalación" }, { status: 400 });
      }
    }

    const report = await prisma.vraReport.create({
      data: {
        tenantId: ctx.tenantId,
        installationId,
        visitId: visitId ?? null,
        title: title ?? `Informe de Vulnerabilidad — ${inst.name}`,
        status: "draft",
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] create report error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
