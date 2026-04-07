import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { publicarEnCanal, actualizarEstadoCanal, type Canal } from "@/lib/ats/distribution.service";
import {
  getAtsConfig,
  updateAtsChannelConfigs,
  CHANNEL_DEFAULTS,
} from "@/lib/ats/config";
import { requireTenantModule } from "@/lib/require-module";

/**
 * Vuelve a ejecutar la publicación en los canales activos del aviso (p. ej. tras editar
 * o para reintentar indexación en Google Empleos).
 *
 * Acepta opcionalmente un body JSON `{ addCanales: ["bne", ...] }` para
 * AÑADIR canales nuevos al aviso (los crea como activos en
 * AtsDistributionChannel) y publicarlos en la misma llamada. Útil para
 * conectar BNE a un aviso que ya estaba publicado en otros canales.
 */
export async function POST(
  request: NextRequest,
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

    let addCanales: Canal[] = [];
    try {
      const body = (await request.json().catch(() => null)) as
        | { addCanales?: string[] }
        | null;
      if (body?.addCanales && Array.isArray(body.addCanales)) {
        addCanales = body.addCanales as Canal[];
      }
    } catch {
      // body opcional
    }

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

    // Existing active channels + any newly requested ones (deduped).
    const existingActive = job.channels.filter((c) => c.activo).map((c) => c.canal);
    const allCanales = Array.from(
      new Set<string>([...existingActive, ...addCanales]),
    ) as Canal[];

    // Auto-enable any explicitly requested channels in the tenant's
    // ats_channels Setting. The intent of POSTing addCanales is "publish
    // here NOW", so we save the user from having to also toggle the switch
    // and click "Guardar canales" beforehand.
    if (addCanales.length > 0) {
      const cfg = await getAtsConfig(ctx.tenantId);
      const merged = { ...(cfg.channelConfigs ?? {}) };
      let changed = false;
      for (const canal of addCanales) {
        const current = merged[canal] ?? CHANNEL_DEFAULTS[canal];
        if (current && !current.enabled) {
          merged[canal] = { ...current, enabled: true };
          changed = true;
        }
      }
      if (changed) {
        await updateAtsChannelConfigs(ctx.tenantId, merged);
      }
    }

    const results: { canal: string; ok: boolean; error?: string }[] = [];

    for (const canal of allCanales) {
      const result = await publicarEnCanal(jobId, canal, ctx.tenantId);
      await actualizarEstadoCanal(
        jobId,
        canal,
        result.success ? "publicado" : "error",
        { externalId: result.externalId, errorDetalle: result.error },
      );
      results.push({ canal, ok: result.success, error: result.error });
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
