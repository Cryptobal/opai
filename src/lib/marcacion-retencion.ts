/**
 * Destrucción de datos personales de guardias desvinculados (Art. 57.4).
 * Conserva marcaciones y reportes (exigidos por ley). No borra
 * `fotoEvidenciaUrl` de las marcas — son evidencia del registro de asistencia.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function isInDestructionWindow(terminatedAt: Date, now: Date): boolean {
  const ageMs = now.getTime() - terminatedAt.getTime();
  return ageMs >= 90 * DAY_MS && ageMs <= 120 * DAY_MS;
}

export function isEligibleForPersonalDataDestruction(
  terminatedAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!terminatedAt) return false;
  return now.getTime() - terminatedAt.getTime() >= 90 * DAY_MS;
}
