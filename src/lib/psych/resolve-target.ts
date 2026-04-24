/**
 * Resuelve los datos del target de un assessment combinando lo que vino
 * en el body con los datos actuales de OpsPersona (si hay personaId).
 * Los datos de DB siempre tienen prioridad sobre el body.
 */

import { prisma } from "@/lib/prisma";

export interface ResolvedTarget {
  targetName: string;
  targetRut: string | null;
  targetEmail: string | null;
  targetPhone: string | null;
}

export interface TargetInput {
  personaId?: string | null;
  targetName: string;
  targetRut?: string | null;
  targetEmail?: string | null;
  targetPhone?: string | null;
}

export async function resolveAssessmentTarget(
  tenantId: string,
  input: TargetInput,
): Promise<ResolvedTarget> {
  const fallback: ResolvedTarget = {
    targetName: input.targetName,
    targetRut: input.targetRut ?? null,
    targetEmail: input.targetEmail ?? null,
    targetPhone: input.targetPhone ?? null,
  };

  if (!input.personaId) return fallback;

  const persona = await prisma.opsPersona.findFirst({
    where: { id: input.personaId, tenantId },
    select: {
      firstName: true,
      lastName: true,
      rut: true,
      email: true,
      phone: true,
      phoneMobile: true,
    },
  });
  if (!persona) return fallback;

  return {
    targetName: `${persona.firstName} ${persona.lastName}`.trim(),
    targetRut: persona.rut ?? fallback.targetRut,
    targetEmail: persona.email ?? fallback.targetEmail,
    targetPhone: persona.phoneMobile ?? persona.phone ?? fallback.targetPhone,
  };
}
