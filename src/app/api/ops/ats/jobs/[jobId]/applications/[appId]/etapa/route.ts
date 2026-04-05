import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

const VALID_TRANSITIONS: Record<string, string[]> = {
  POSTULADO: ["EN_REVISION", "DESCARTADO"],
  EN_REVISION: ["ENTREVISTA", "DESCARTADO"],
  ENTREVISTA: ["OFERTA", "DESCARTADO"],
  OFERTA: ["CONTRATADO", "DESCARTADO"],
  DESCARTADO: ["POSTULADO"], // permite reactivar
};

const updateEtapaSchema = z.object({
  etapa: z.enum(["POSTULADO", "EN_REVISION", "ENTREVISTA", "OFERTA", "CONTRATADO", "DESCARTADO"]),
  notasInternas: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; appId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId, appId } = await params;

    const parsed = await parseBody(request, updateEtapaSchema);
    if (parsed.error) return parsed.error;
    const { etapa, notasInternas } = parsed.data;

    const app = await prisma.atsApplication.findFirst({
      where: { id: appId, jobPostingId: jobId, tenantId: ctx.tenantId },
    });
    if (!app) {
      return NextResponse.json({ success: false, error: "Postulación no encontrada" }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[app.etapa] ?? [];
    if (!allowed.includes(etapa)) {
      return NextResponse.json(
        { success: false, error: `Transición inválida: ${app.etapa} → ${etapa}` },
        { status: 400 },
      );
    }

    const updated = await prisma.atsApplication.update({
      where: { id: appId },
      data: {
        etapa,
        etapaAt: new Date(),
        notasInternas: notasInternas ?? app.notasInternas,
      },
    });

    // Si se contrata, actualizar lifecycle del guardia
    if (etapa === "CONTRATADO") {
      await prisma.opsGuardia.update({
        where: { id: app.guardiaId },
        data: {
          lifecycleStatus: "contratado",
          hiredAt: new Date(),
        },
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[ATS] Error updating stage:", error);
    return NextResponse.json({ success: false, error: "Error al cambiar etapa" }, { status: 500 });
  }
}
