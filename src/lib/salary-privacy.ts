/**
 * Privacidad de sueldos por cargo sensible.
 * Puro: no loguea montos ni RUT.
 *
 * El sueldo se marca en el cargo CPQ (`CpqCargo.salarySensitive`), no en la ficha.
 * Los cargos cuyo nombre es Director (o variante) son sensibles siempre, aunque
 * el checkbox del catálogo esté apagado.
 */
import { hasCapability, type RolePermissions } from "@/lib/permissions";

/** Director / Directora / Directores / Subdirector — no “Directorio”. */
const DIRECTOR_CARGO_RE = /director(?:a|es|as)?\b/i;

export function cargoNameImpliesSensitive(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const normalized = name.normalize("NFD").replace(/\p{M}/gu, "");
  return DIRECTOR_CARGO_RE.test(normalized);
}

export function isSalarySensitiveCargo(opts: {
  salarySensitive?: boolean | null;
  names?: Array<string | null | undefined>;
}): boolean {
  if (opts.salarySensitive === true) return true;
  return (opts.names ?? []).some((n) => cargoNameImpliesSensitive(n));
}

export function canViewSensitiveSalary(perms: RolePermissions): boolean {
  return hasCapability(perms, "view_sensitive_salary");
}

export function shouldHideSalaryAmount(opts: {
  salarySensitive: boolean;
  canViewSensitive: boolean;
}): boolean {
  return opts.salarySensitive && !opts.canViewSensitive;
}

export function maskSalaryAmount(
  amount: number | null,
  opts: { salarySensitive: boolean; canViewSensitive: boolean },
): number | null {
  if (shouldHideSalaryAmount(opts)) return null;
  return amount;
}

export function formatMaskedSalaryClp(
  amount: number | null,
  opts: { salarySensitive: boolean; canViewSensitive: boolean },
): string {
  const masked = maskSalaryAmount(amount, opts);
  if (masked == null) return "—";
  return `$${masked.toLocaleString("es-CL")}`;
}

export function redactResolvedSalary<T extends {
  salarySensitive?: boolean;
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationCustomAmount: number;
  bonos: unknown[];
}>(
  resolved: T,
  canViewSensitive: boolean,
): T & { salaryHidden: boolean } {
  const hide = shouldHideSalaryAmount({
    salarySensitive: resolved.salarySensitive === true,
    canViewSensitive,
  });
  if (!hide) return { ...resolved, salaryHidden: false };
  return {
    ...resolved,
    baseSalary: 0,
    colacion: 0,
    movilizacion: 0,
    gratificationCustomAmount: 0,
    bonos: [],
    salaryHidden: true,
  };
}

export function redactPuestoSalaryFields<T extends {
  cargo?: { salarySensitive?: boolean; name?: string } | null;
  name?: string;
  baseSalary?: unknown;
  salaryStructure?: Record<string, unknown> | null;
}>(puesto: T, canViewSensitive: boolean): T {
  if (
    !shouldHideSalaryAmount({
      salarySensitive: isSalarySensitiveCargo({
        salarySensitive: puesto.cargo?.salarySensitive,
        names: [puesto.cargo?.name, puesto.name],
      }),
      canViewSensitive,
    })
  ) {
    return puesto;
  }
  return {
    ...puesto,
    baseSalary: null,
    salaryStructure: puesto.salaryStructure
      ? {
          ...puesto.salaryStructure,
          baseSalary: 0,
          netSalaryEstimate: 0,
          colacion: 0,
          movilizacion: 0,
        }
      : puesto.salaryStructure,
  };
}
