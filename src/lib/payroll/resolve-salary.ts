/**
 * Resolve salary structure for a guard.
 * Priority: RUT override > Puesto operativo assignment
 */

import { prisma } from "@/lib/prisma";

export interface ResolvedSalary {
  source: "RUT" | "PUESTO" | "NONE";
  structureId: string | null;
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationType: string;
  gratificationCustomAmount: number;
  bonos: Array<{
    bonoCatalogId: string;
    bonoCode: string;
    bonoName: string;
    bonoType: string;
    isTaxable: boolean;
    isTributable: boolean;
    amount: number;
    percentage: number | null;
  }>;
  installationId: string | null;
  installationName: string | null;
  puestoId: string | null;
  puestoName: string | null;
}

export async function resolveSalaryStructure(guardiaId: string): Promise<ResolvedSalary> {
  const noSalary: ResolvedSalary = {
    source: "NONE",
    structureId: null,
    baseSalary: 0,
    colacion: 0,
    movilizacion: 0,
    gratificationType: "AUTO_25",
    gratificationCustomAmount: 0,
    bonos: [],
    installationId: null,
    installationName: null,
    puestoId: null,
    puestoName: null,
  };

  // 1. Check if guard has a RUT override
  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: {
      salaryStructureId: true,
      salaryStructure: {
        select: {
          id: true,
          baseSalary: true,
          colacion: true,
          movilizacion: true,
          gratificationType: true,
          gratificationCustomAmount: true,
          isActive: true,
          effectiveFrom: true,
          effectiveUntil: true,
          bonos: {
            where: { isActive: true },
            select: {
              overrideAmount: true,
              overridePercentage: true,
              bonoCatalog: {
                select: { id: true, code: true, name: true, bonoType: true, isTaxable: true, isTributable: true, defaultAmount: true, defaultPercentage: true },
              },
            },
          },
        },
      },
      asignaciones: {
        where: { isActive: true },
        orderBy: { startDate: "desc" },
        take: 1,
        select: {
          installationId: true,
          puestoId: true,
          installation: { select: { id: true, name: true } },
          puesto: {
            select: {
              id: true,
              name: true,
              baseSalary: true,
              salaryStructure: {
                select: {
                  id: true,
                  baseSalary: true,
                  colacion: true,
                  movilizacion: true,
                  gratificationType: true,
                  gratificationCustomAmount: true,
                  isActive: true,
                  bonos: {
                    where: { isActive: true },
                    select: {
                      overrideAmount: true,
                      overridePercentage: true,
                      bonoCatalog: {
                        select: { id: true, code: true, name: true, bonoType: true, isTaxable: true, isTributable: true, defaultAmount: true, defaultPercentage: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!guardia) return noSalary;

  // Priority 1: RUT override (check dates)
  const now = new Date();
  const rutStructure = guardia.salaryStructure;
  const rutIsValid = rutStructure?.isActive &&
    (!rutStructure.effectiveFrom || new Date(rutStructure.effectiveFrom) <= now) &&
    (!rutStructure.effectiveUntil || new Date(rutStructure.effectiveUntil) >= now);

  if (rutIsValid && rutStructure) {
    const ss = rutStructure;
    const assignment = guardia.asignaciones[0];
    return {
      source: "RUT",
      structureId: ss.id,
      baseSalary: Number(ss.baseSalary),
      colacion: Number(ss.colacion),
      movilizacion: Number(ss.movilizacion),
      gratificationType: ss.gratificationType,
      gratificationCustomAmount: Number(ss.gratificationCustomAmount ?? 0),
      bonos: mapBonos(ss.bonos, Number(ss.baseSalary)),
      installationId: assignment?.installation?.id ?? null,
      installationName: assignment?.installation?.name ?? null,
      puestoId: assignment?.puesto?.id ?? null,
      puestoName: assignment?.puesto?.name ?? null,
    };
  }

  // Priority 2: Puesto assignment
  const assignment = guardia.asignaciones[0];
  if (!assignment) return noSalary;

  const puestoSS = assignment.puesto.salaryStructure;
  if (puestoSS?.isActive) {
    return {
      source: "PUESTO",
      structureId: puestoSS.id,
      baseSalary: Number(puestoSS.baseSalary),
      colacion: Number(puestoSS.colacion),
      movilizacion: Number(puestoSS.movilizacion),
      gratificationType: puestoSS.gratificationType,
      gratificationCustomAmount: Number(puestoSS.gratificationCustomAmount ?? 0),
      bonos: mapBonos(puestoSS.bonos, Number(puestoSS.baseSalary)),
      installationId: assignment.installation?.id ?? null,
      installationName: assignment.installation?.name ?? null,
      puestoId: assignment.puesto.id,
      puestoName: assignment.puesto.name,
    };
  }

  // Fallback: use puesto baseSalary directly (legacy)
  const legacy = Number(assignment.puesto.baseSalary ?? 0);
  if (legacy > 0) {
    return {
      source: "PUESTO",
      structureId: null,
      baseSalary: legacy,
      colacion: 0,
      movilizacion: 0,
      gratificationType: "AUTO_25",
      gratificationCustomAmount: 0,
      bonos: [],
      installationId: assignment.installation?.id ?? null,
      installationName: assignment.installation?.name ?? null,
      puestoId: assignment.puesto.id,
      puestoName: assignment.puesto.name,
    };
  }

  return noSalary;
}

function mapBonos(
  bonos: Array<{
    overrideAmount: any;
    overridePercentage: any;
    bonoCatalog: { id: string; code: string; name: string; bonoType: string; isTaxable: boolean; isTributable: boolean; defaultAmount: any; defaultPercentage: any };
  }>,
  baseSalary: number
): ResolvedSalary["bonos"] {
  return bonos.map((b) => {
    const cat = b.bonoCatalog;
    let amount = 0;
    let percentage: number | null = null;

    if (cat.bonoType === "FIJO") {
      amount = Number(b.overrideAmount ?? cat.defaultAmount ?? 0);
    } else if (cat.bonoType === "PORCENTUAL") {
      percentage = Number(b.overridePercentage ?? cat.defaultPercentage ?? 0);
      amount = Math.round(baseSalary * percentage / 100);
    } else if (cat.bonoType === "CONDICIONAL") {
      amount = Number(b.overrideAmount ?? cat.defaultAmount ?? 0);
    }

    return {
      bonoCatalogId: cat.id,
      bonoCode: cat.code,
      bonoName: cat.name,
      bonoType: cat.bonoType,
      isTaxable: cat.isTaxable,
      isTributable: cat.isTributable,
      amount,
      percentage,
    };
  });
}
