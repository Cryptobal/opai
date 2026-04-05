import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getAtsConfig } from "@/lib/ats/config";
import { publicarEnCanal, actualizarEstadoCanal, type Canal } from "@/lib/ats/distribution.service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId } = await params;

    const job = await prisma.atsJobPosting.findFirst({
      where: { id: jobId, tenantId: ctx.tenantId },
      include: { channels: true },
    });

    if (!job) {
      return NextResponse.json({ success: false, error: "Aviso no encontrado" }, { status: 404 });
    }
    if (job.estado !== "BORRADOR" && job.estado !== "PAUSADO") {
      return NextResponse.json(
        { success: false, error: "Solo se puede activar un aviso en borrador o pausado" },
        { status: 400 },
      );
    }

    const config = await getAtsConfig(ctx.tenantId);

    const expiraAt = job.expiraAt ?? new Date(Date.now() + config.expiracionDias * 24 * 60 * 60 * 1000);

    const updated = await prisma.atsJobPosting.update({
      where: { id: jobId },
      data: { estado: "ACTIVO", expiraAt },
    });

    // Publicar en canales si autoPublicar
    if (config.autoPublicarAlActivar) {
      const canales = job.channels.filter((c) => c.activo);
      for (const ch of canales) {
        const result = await publicarEnCanal(jobId, ch.canal as Canal, ctx.tenantId);
        await actualizarEstadoCanal(
          jobId,
          ch.canal as Canal,
          result.success ? "publicado" : "error",
          { externalId: result.externalId, errorDetalle: result.error },
        );
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[ATS] Error activating job:", error);
    return NextResponse.json({ success: false, error: "Error al activar aviso" }, { status: 500 });
  }
}
