import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { publicarEnCanal, actualizarEstadoCanal, type Canal } from "@/lib/ats/distribution.service";
import { requireTenantModule } from "@/lib/require-module";

/**
 * Vuelve a ejecutar la publicación en los canales activos del aviso (p. ej. tras editar
 * o para reintentar indexación en Google Empleos).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const modCheck = await requireTenantModule("ats");
    if (!modCheck.authorized) return modCheck.response;

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
    if (job.estado !== "ACTIVO") {
      return NextResponse.json(
        { success: false, error: "Solo se puede republicar un aviso activo" },
        { status: 400 },
      );
    }

    const canales = job.channels.filter((c) => c.activo);
    const results: { canal: string; ok: boolean; error?: string }[] = [];

    for (const ch of canales) {
      const result = await publicarEnCanal(jobId, ch.canal as Canal, ctx.tenantId);
      await actualizarEstadoCanal(
        jobId,
        ch.canal as Canal,
        result.success ? "publicado" : "error",
        { externalId: result.externalId, errorDetalle: result.error },
      );
      results.push({ canal: ch.canal, ok: result.success, error: result.error });
    }

    const anyOk = results.some((r) => r.ok);
    return NextResponse.json({
      success: true,
      data: { results, message: anyOk ? "Republicación enviada" : "Ningún canal pudo completarse; revisa los errores" },
    });
  } catch (error) {
    console.error("[ATS] Error republishing job:", error);
    return NextResponse.json({ success: false, error: "Error al republicar aviso" }, { status: 500 });
  }
}
