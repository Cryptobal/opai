/**
 * Validación del correo institucional DT (Res. Ex. N°38 Art. 23 a-c).
 * Dominio exacto `@dt.gob.cl` — sin subdominios ni sufijos.
 */

export const DT_EMAIL_DOMAIN = "dt.gob.cl";

export function normalizeDtEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Extrae el host de un correo y lo compara con `dt.gob.cl` en minúsculas.
 * Rechaza `foo@sub.dt.gob.cl` y `foo@dt.gob.cl.algo`.
 */
export function isDtGobClEmail(raw: string): boolean {
  const email = normalizeDtEmail(raw);
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const local = email.slice(0, at);
  const host = email.slice(at + 1);
  if (!local || local.includes(" ")) return false;
  return host === DT_EMAIL_DOMAIN;
}
