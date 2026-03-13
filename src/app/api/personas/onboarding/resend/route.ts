import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsCapability } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  guardiaId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsCapability(ctx, "guardias_manage");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, schema);
    if (parsed.error) return parsed.error;
    const { guardiaId } = parsed.data;

    await prisma.opsOnboardingStatus.upsert({
      where: { guardiaId },
      update: { emailEnviado: false },
      create: {
        tenantId: ctx.tenantId,
        guardiaId,
        estado: "PENDIENTE",
      },
    });

    const { handleGuardActivation } = await import(
      "@/lib/triggers/onboarding-trigger"
    );
    const result = await handleGuardActivation(guardiaId, ctx.tenantId);

    if (!result.ok) {
      const messages: Record<string, string> = {
        no_guardia: "Guardia no encontrado",
        no_email: "El guardia no tiene email configurado",
        no_template: "No hay plantilla de onboarding configurada. Ejecuta el seed: npx prisma db seed",
        send_error: result.detail ?? "Error al enviar el email",
      };
      return NextResponse.json(
        { success: false, error: messages[result.reason] ?? result.reason },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ONBOARDING] Error resending:", error);
    return NextResponse.json(
      { success: false, error: "Error al reenviar onboarding" },
      { status: 500 }
    );
  }
}
