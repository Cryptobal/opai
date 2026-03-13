import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsCapability } from "@/lib/ops";
import { sendEmailToGuardia } from "@/lib/email/onboarding-email-service";
import type { EmailBlock } from "@/lib/email/types";

const sendSchema = z.object({
  guardiaIds: z.array(z.string().uuid()).min(1, "Selecciona al menos un destinatario"),
  templateId: z.string().uuid(),
  asunto: z.string().min(1, "El asunto es requerido").optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
    if (forbidden) return forbidden;

    const { data, error } = await parseBody(request, sendSchema);
    if (error) return error;

    const template = await prisma.opsEmailTemplate.findUnique({
      where: { id: data.templateId },
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Plantilla no encontrada" },
        { status: 404 },
      );
    }

    const loteId = crypto.randomUUID();
    const contenido = template.contenido as unknown as EmailBlock[];
    const asunto = data.asunto || template.asunto;

    let enviados = 0;
    let errores = 0;

    for (const guardiaId of data.guardiaIds) {
      try {
        const result = await sendEmailToGuardia({
          tenantId: ctx.tenantId,
          guardiaId,
          templateId: template.id,
          asunto,
          contenido,
          tipo: data.guardiaIds.length > 1 ? "MANUAL_MASIVO" : "MANUAL_INDIVIDUAL",
          loteId,
        });

        if (result.success) {
          enviados++;
        } else {
          errores++;
        }
      } catch {
        errores++;
      }
    }

    return NextResponse.json({
      success: true,
      loteId,
      enviados,
      errores,
    });
  } catch (error) {
    console.error("[API] comunicaciones/send POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar correos" },
      { status: 500 },
    );
  }
}
