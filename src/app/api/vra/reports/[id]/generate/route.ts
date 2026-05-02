import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { runVraGenerationPipeline } from "@/lib/vra/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min máximo para pipeline

/**
 * POST /api/vra/reports/[id]/generate
 * Ejecuta el pipeline de 3 fases (vision → secciones → assembly).
 * El cliente debe esperar — no es async/queue (Bloque 4 podrá moverlo a job queue).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }
    if (report.status === "generating") {
      return NextResponse.json({ success: false, error: "El informe ya está siendo generado" }, { status: 409 });
    }

    await runVraGenerationPipeline({ reportId: id, tenantId: ctx.tenantId, userId: ctx.userId });

    const updated = await prisma.vraReport.findUnique({
      where: { id },
      include: { sections: true },
    });

    return NextResponse.json({ success: true, report: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] generate error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
