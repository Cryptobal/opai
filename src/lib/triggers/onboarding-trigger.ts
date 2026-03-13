/**
 * Trigger: Onboarding al activar guardia.
 * Se ejecuta cuando lifecycleStatus cambia a "contratado" (guardia activo).
 */

import { prisma } from "@/lib/prisma";
import { sendEmailToGuardia } from "@/lib/email/onboarding-email-service";
export async function handleGuardActivation(guardiaId: string, tenantId: string) {
  try {
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      include: {
        persona: true,
      },
    });

    if (!guardia) return;

    const email =
      guardia.personalEmail ??
      guardia.persona?.personalEmail ??
      guardia.persona?.email;

    if (!email) {
      console.warn(`[ONBOARDING] Guardia ${guardiaId} sin email, omitiendo envío`);
      return;
    }

    // Buscar o crear OnboardingStatus
    let status = await prisma.opsOnboardingStatus.findUnique({
      where: { guardiaId },
    });

    if (!status) {
      status = await prisma.opsOnboardingStatus.create({
        data: {
          tenantId,
          guardiaId,
          estado: "PENDIENTE",
        },
      });
    }

    if (status.emailEnviado) {
      console.log(`[ONBOARDING] Guardia ${guardiaId} ya recibió onboarding, omitiendo`);
      return;
    }

    // Buscar plantilla ONBOARDING default
    const template = await prisma.opsEmailTemplate.findFirst({
      where: {
        tenantId,
        tipo: "ONBOARDING",
        esDefault: true,
        activo: true,
      },
    });

    if (!template) {
      console.warn("[ONBOARDING] No hay plantilla ONBOARDING default configurada");
      return;
    }

    const contenido = template.contenido as Array<{
      id: string;
      tipo: string;
      contenido: Record<string, unknown>;
      orden: number;
    }>;

    const result = await sendEmailToGuardia({
      tenantId,
      guardiaId,
      templateId: template.id,
      asunto: template.asunto,
      contenido,
      tipo: "AUTOMATICO",
      trigger: "ACTIVACION",
    });

    if (result.success) {
      await prisma.opsOnboardingStatus.update({
        where: { guardiaId },
        data: {
          emailEnviado: true,
          fechaEnvio: new Date(),
          estado: "ENVIADO",
        },
      });
      console.log(`[ONBOARDING] Email enviado a guardia ${guardiaId}`);
    } else {
      console.error(`[ONBOARDING] Error enviando a ${guardiaId}:`, result.error);
    }
  } catch (err) {
    console.error("[ONBOARDING] Error en handleGuardActivation:", err);
  }
}
