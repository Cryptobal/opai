/**
 * Trigger: Onboarding al activar guardia.
 * Se ejecuta cuando lifecycleStatus cambia a "contratado" (guardia activo).
 */

import { prisma } from "@/lib/prisma";
import { sendEmailToGuardia } from "@/lib/email/onboarding-email-service";
import { asignarPin } from "@/lib/ats/pin.service";
import type { EmailBlock } from "@/lib/email/types";
export type GuardActivationResult =
  | { ok: true }
  | { ok: false; reason: "no_guardia" | "no_email" | "no_template" | "send_error"; detail?: string };

export async function handleGuardActivation(guardiaId: string, tenantId: string): Promise<GuardActivationResult> {
  try {
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      include: {
        persona: true,
      },
    });

    if (!guardia) return { ok: false, reason: "no_guardia" };

    // Auto-generar PIN si el guardia no tiene uno
    if (!guardia.marcacionPin) {
      try {
        await asignarPin(guardiaId);
        console.log(`[ONBOARDING] PIN generado automáticamente para guardia ${guardiaId}`);
      } catch (err) {
        console.error(`[ONBOARDING] Error generando PIN para guardia ${guardiaId}:`, err);
      }
    }

    const email =
      guardia.personalEmail ??
      guardia.persona?.personalEmail ??
      guardia.persona?.email;

    if (!email) {
      console.warn(`[ONBOARDING] Guardia ${guardiaId} sin email, omitiendo envío`);
      return { ok: false, reason: "no_email" };
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
      return { ok: true }; // Ya enviado, considerar éxito
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
      return { ok: false, reason: "no_template" };
    }

    const contenido: EmailBlock[] = template.contenido as unknown as EmailBlock[];

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
      return { ok: true };
    } else {
      console.error(`[ONBOARDING] Error enviando a ${guardiaId}:`, result.error);
      return { ok: false, reason: "send_error", detail: result.error ?? undefined };
    }
  } catch (err) {
    console.error("[ONBOARDING] Error en handleGuardActivation:", err);
    return { ok: false, reason: "send_error", detail: (err as Error).message };
  }
}
