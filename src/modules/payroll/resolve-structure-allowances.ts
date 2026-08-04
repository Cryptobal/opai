/**
 * Deriva bonos imponibles / no imponibles de una estructura de sueldo.
 * Misma regla que `src/app/api/ops/puestos/route.ts` (FIJO / PORCENTUAL / CONDICIONAL).
 */

/** Acepta number/string/Decimal-like (Prisma Decimal tiene valueOf/toString). */
type NumericLike = number | string | { toString(): string } | null | undefined;

export interface StructureBonoInput {
  overrideAmount?: NumericLike;
  overridePercentage?: NumericLike;
  bonoCatalog: {
    bonoType: string;
    isTaxable: boolean;
    defaultAmount?: NumericLike;
    defaultPercentage?: NumericLike;
  } | null;
}

export interface StructureAllowances {
  bonosImponibles: number;
  bonosNoImponibles: number;
}

export function resolveStructureAllowances(
  baseSalary: number,
  bonos: StructureBonoInput[],
): StructureAllowances {
  let bonosImponibles = 0;
  let bonosNoImponibles = 0;
  for (const b of bonos) {
    const cat = b.bonoCatalog;
    if (!cat) continue;
    let amt = 0;
    if (cat.bonoType === "FIJO") {
      amt = Number(b.overrideAmount ?? cat.defaultAmount ?? 0);
    } else if (cat.bonoType === "PORCENTUAL") {
      const pct = Number(b.overridePercentage ?? cat.defaultPercentage ?? 0);
      amt = Math.round((baseSalary * pct) / 100);
    } else if (cat.bonoType === "CONDICIONAL") {
      amt = Number(b.overrideAmount ?? cat.defaultAmount ?? 0);
    }
    if (cat.isTaxable) bonosImponibles += amt;
    else bonosNoImponibles += amt;
  }
  return { bonosImponibles, bonosNoImponibles };
}
