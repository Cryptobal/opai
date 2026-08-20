/**
 * Privacidad de sueldos por cargo sensible.
 * Puro: no loguea montos ni RUT.
 */
import { hasCapability, type RolePermissions } from "@/lib/permissions";

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
  cargo?: { salarySensitive?: boolean } | null;
  baseSalary?: unknown;
  salaryStructure?: Record<string, unknown> | null;
}>(puesto: T, canViewSensitive: boolean): T {
  if (
    !shouldHideSalaryAmount({
      salarySensitive: puesto.cargo?.salarySensitive === true,
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
