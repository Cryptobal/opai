import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { requireTenantModule } from '@/lib/require-module';
import { logAudit } from "@/lib/audit";

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
  psychOverrideJustification: z.string().optional(),
  contractType: z.enum(["indefinido", "plazo_fijo"]).optional(),
  contractStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contractPeriod1End: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  contractPeriod2End: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
}).superRefine((val, ctx) => {
  if (val.etapa !== "CONTRATADO") return;
  if (!val.contractStartDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contractStartDate"],
      message: "Fecha de inicio de contrato es requerida",
    });
  }
  if (val.contractType === "plazo_fijo" && !val.contractPeriod1End) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contractPeriod1End"],
      message: "Fecha del 1er plazo es requerida para plazo fijo",
    });
  }
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; appId: string }> },
) {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { jobId, appId } = await params;

    const parsed = await parseBody(request, updateEtapaSchema);
    if (parsed.error) return parsed.error;
    const {
      etapa,
      notasInternas,
      psychOverrideJustification,
      contractType,
      contractStartDate,
      contractPeriod1End,
      contractPeriod2End,
    } = parsed.data;

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

    // Psych override: si el guardia tiene assessment con banda NOT_RECOMMENDED,
    // exigir justificación ≥30 chars antes de pasar a CONTRATADO.
    if (etapa === "CONTRATADO") {
      const guardia = await prisma.opsGuardia.findUnique({
        where: { id: app.guardiaId },
        select: { personaId: true },
      });
      if (guardia?.personaId) {
        const blocking = await prisma.psychAssessment.findFirst({
          where: {
            tenantId: ctx.tenantId,
            personaId: guardia.personaId,
            result: { band: "NOT_RECOMMENDED" },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, result: { select: { band: true } } },
        });
        if (blocking) {
          const justif = psychOverrideJustification?.trim() ?? "";
          if (justif.length < 30) {
            return NextResponse.json(
              {
                success: false,
                error:
                  "Esta evaluación psicolaboral sugiere no recomendar. Requiere justificación (mínimo 30 caracteres) en el campo 'psychOverrideJustification' para avanzar a CONTRATADO.",
                requiresPsychOverride: true,
                blockingAssessmentId: blocking.id,
              },
              { status: 400 },
            );
          }
          await logAudit({
            userId: ctx.userId,
            userEmail: ctx.userEmail,
            tenantId: ctx.tenantId,
            action: "UPDATE",
            entity: "psych_override",
            entityId: blocking.id,
            details: {
              event: "psych.not_recommended.overridden",
              applicationId: appId,
              guardiaId: app.guardiaId,
              justification: justif,
            },
            request,
          });
        }
      }
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
      const start = contractStartDate ? new Date(`${contractStartDate}T00:00:00.000Z`) : new Date();
      const type = contractType ?? "indefinido";
      await prisma.opsGuardia.update({
        where: { id: app.guardiaId },
        data: {
          lifecycleStatus: "contratado",
          hiredAt: start,
          contractType: type,
          contractStartDate: start,
          contractPeriod1End:
            type === "plazo_fijo" && contractPeriod1End
              ? new Date(`${contractPeriod1End}T00:00:00.000Z`)
              : null,
          contractPeriod2End:
            type === "plazo_fijo" && contractPeriod2End
              ? new Date(`${contractPeriod2End}T00:00:00.000Z`)
              : null,
          contractCurrentPeriod: 1,
        },
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[ATS] Error updating stage:", error);
    return NextResponse.json({ success: false, error: "Error al cambiar etapa" }, { status: 500 });
  }
}
