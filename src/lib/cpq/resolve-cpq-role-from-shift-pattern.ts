/**
 * Mapea el patrón de turno de una plantilla (4x4, 5x2, etc.) al id de rol CPQ.
 * Usado al aplicar plantillas en Lead y CPQ para no fijar siempre el rol por defecto (p. ej. 4x4).
 */

export type CpqRoleOption = { id: string; name: string; salary?: number | null };

function normRoleName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("×", "x");
}

/**
 * @param shiftPattern — p. ej. "4x4", "5x2", "2x5" (también `rolShiftPattern` si difiere del turno real)
 * @param roles — catálogo CPQ de roles
 * @param fallback — típicamente `catalogDefaults.rolId`
 */
export function resolveRolIdFromShiftPattern(
  shiftPattern: string,
  roles: CpqRoleOption[],
  fallback?: string
): string | undefined {
  if (!roles.length) return fallback;
  const p = normRoleName(shiftPattern.trim());
  if (!p) return fallback;

  const exact = roles.find((r) => normRoleName(r.name) === p);
  if (exact) return exact.id;

  // Plantillas usan 5x2 para L-V; en catálogo puede existir "5x2" y/o "2x5" (convención distinta)
  if (p === "5x2" || p === "2x5") {
    const fiveTwo = roles.find((r) => normRoleName(r.name) === "5x2");
    if (fiveTwo) return fiveTwo.id;
    const twoFive = roles.find((r) => normRoleName(r.name) === "2x5");
    if (twoFive) return twoFive.id;
  }

  if (p.includes("4x4")) {
    const r = roles.find((x) => normRoleName(x.name).includes("4x4"));
    if (r) return r.id;
  }

  const sub = roles.find((x) => normRoleName(x.name).includes(p));
  if (sub) return sub.id;

  return fallback;
}

/** Sueldo bruto sugerido del rol (CLP), o fallback si el rol no tiene salary configurado. */
export function resolveSalaryFromRole(
  rolId: string | undefined,
  roles: CpqRoleOption[],
  fallbackSalary = 550000
): number {
  if (!rolId) return fallbackSalary;
  const salary = roles.find((r) => r.id === rolId)?.salary;
  return salary != null && salary > 0 ? salary : fallbackSalary;
}

/**
 * Resuelve rol y sueldo bruto al aplicar una plantilla de cobertura.
 * Prioriza el salary configurado en CPQ > Roles/Turnos sobre el bruto hardcodeado de la plantilla.
 */
export function resolveTemplateRowCatalog(
  shiftPattern: string | undefined,
  roles: CpqRoleOption[],
  fallbackRolId?: string,
  templateBruto = 550000
): { rolId: string; baseSalary: number } {
  const rolId =
    (shiftPattern
      ? resolveRolIdFromShiftPattern(shiftPattern, roles, fallbackRolId)
      : fallbackRolId) ??
    fallbackRolId ??
    roles[0]?.id ??
    "";
  const baseSalary = resolveSalaryFromRole(rolId, roles, templateBruto);
  return { rolId, baseSalary };
}
