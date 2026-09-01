/**
 * Unicidad de correo personal dentro del tenant (Art. 12 e).
 */

import { prisma } from "@/lib/prisma";
import { normalizePersonalEmail } from "@/lib/marcacion-format";

export const PERSONAL_EMAIL_TAKEN_ERROR =
  "Ese correo personal ya está registrado para otro trabajador de la empresa (Art. 12 e).";

export const PERSONAL_EMAIL_REQUIRED_ERROR =
  "El enrolamiento requiere un correo personal del trabajador (Res. Exenta N°38 Art. 12).";

export async function isPersonalEmailTaken(params: {
  tenantId: string;
  email: string;
  excludeGuardiaId?: string;
  excludePersonaId?: string;
}): Promise<boolean> {
  const email = normalizePersonalEmail(params.email);
  if (!email) return false;

  const [personaHit, guardiaHit] = await Promise.all([
    prisma.opsPersona.findFirst({
      where: {
        tenantId: params.tenantId,
        personalEmail: { equals: email, mode: "insensitive" },
        ...(params.excludePersonaId ? { id: { not: params.excludePersonaId } } : {}),
      },
      select: { id: true },
    }),
    prisma.opsGuardia.findFirst({
      where: {
        tenantId: params.tenantId,
        personalEmail: { equals: email, mode: "insensitive" },
        ...(params.excludeGuardiaId ? { id: { not: params.excludeGuardiaId } } : {}),
      },
      select: { id: true },
    }),
  ]);

  return Boolean(personaHit || guardiaHit);
}

export function resolvePersonalEmail(params: {
  guardiaPersonalEmail?: string | null;
  personaPersonalEmail?: string | null;
  personaEmail?: string | null;
}): string | null {
  const raw =
    params.guardiaPersonalEmail?.trim() ||
    params.personaPersonalEmail?.trim() ||
    null;
  return raw || null;
}
