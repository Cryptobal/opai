import type { Prisma, PrismaClient } from "@prisma/client";
import { simulatePayslip } from "@/modules/payroll/engine/simulate-payslip";
import { resolveStructureAllowances } from "@/modules/payroll/resolve-structure-allowances";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PuestoSalaryBonoInput {
  bonoCatalogId?: string | null;
  overrideAmount?: number | null;
  overridePercentage?: number | null;
}

export interface CreatePuestoSalaryStructureInput {
  tenantId: string;
  puestoId: string;
  baseSalary: number;
  colacion?: number | null;
  movilizacion?: number | null;
  /** AUTO_25 | CUSTOM. Default AUTO_25. */
  gratificationType?: string | null;
  gratificationCustomAmount?: number | null;
  effectiveFrom?: Date | null;
  bonos?: PuestoSalaryBonoInput[] | null;
  /**
   * Líquido ya conocido (ej. el calculado por la cotización). Si viene > 0 se
   * persiste directo; si no, se simula con el motor de payroll.
   */
  netSalaryEstimate?: number | null;
  createdBy?: string | null;
}

export interface CreatePuestoSalaryStructureResult {
  salaryStructureId: string;
  netSalaryEstimate: number | null;
}

/**
 * Crea la `PayrollSalaryStructure` de un puesto operativo, la vincula
 * (`salaryStructureId`), registra sus bonos y persiste el líquido estimado.
 * Única fuente para que un puesto quede visible en la proyección de caja de
 * remuneraciones (que filtra `salaryStructureId != null`).
 *
 * Acepta un cliente transaccional para las escrituras. La simulación del
 * líquido (cuando no viene informado) es best-effort y nunca revierte la
 * creación de la estructura.
 */
export async function createPuestoSalaryStructure(
  db: Db,
  input: CreatePuestoSalaryStructureInput,
): Promise<CreatePuestoSalaryStructureResult> {
  const baseSalary = Number(input.baseSalary);
  const colacion = Number(input.colacion ?? 0);
  const movilizacion = Number(input.movilizacion ?? 0);
  const gratificationType = input.gratificationType ?? "AUTO_25";
  const gratificationCustomAmount =
    input.gratificationCustomAmount == null ? null : Number(input.gratificationCustomAmount);
  const bonos = (input.bonos ?? []).filter((b) => !!b.bonoCatalogId);

  const salaryStructure = await db.payrollSalaryStructure.create({
    data: {
      tenantId: input.tenantId,
      sourceType: "PUESTO",
      sourceId: input.puestoId,
      baseSalary,
      colacion,
      movilizacion,
      gratificationType,
      gratificationCustomAmount,
      isActive: true,
      effectiveFrom: input.effectiveFrom ?? new Date(),
      createdBy: input.createdBy ?? null,
    },
  });

  await db.opsPuestoOperativo.update({
    where: { id: input.puestoId },
    data: { salaryStructureId: salaryStructure.id },
  });

  if (bonos.length > 0) {
    await db.payrollSalaryStructureBono.createMany({
      data: bonos.map((b) => ({
        salaryStructureId: salaryStructure.id,
        bonoCatalogId: b.bonoCatalogId as string,
        overrideAmount: b.overrideAmount ?? null,
        overridePercentage: b.overridePercentage ?? null,
        isActive: true,
      })),
    });
  }

  let netSalaryEstimate: number | null = null;
  const knownNet = Number(input.netSalaryEstimate ?? 0);
  if (knownNet > 0) {
    netSalaryEstimate = knownNet;
  } else {
    try {
      let bonosImponibles = 0;
      let bonosNoImponibles = 0;
      if (bonos.length > 0) {
        const bonoIds = bonos.map((b) => b.bonoCatalogId as string);
        const catalog = await db.payrollBonoCatalog.findMany({
          where: { id: { in: bonoIds }, tenantId: input.tenantId },
          select: {
            id: true,
            bonoType: true,
            isTaxable: true,
            defaultAmount: true,
            defaultPercentage: true,
          },
        });
        const resolved = resolveStructureAllowances(
          baseSalary,
          bonos.map((b) => ({
            overrideAmount: b.overrideAmount ?? null,
            overridePercentage: b.overridePercentage ?? null,
            bonoCatalog: catalog.find((c) => c.id === b.bonoCatalogId) ?? null,
          })),
        );
        bonosImponibles = resolved.bonosImponibles;
        bonosNoImponibles = resolved.bonosNoImponibles;
      }
      const result = await simulatePayslip({
        base_salary_clp: baseSalary,
        gratification_clp:
          gratificationType === "CUSTOM" ? Number(gratificationCustomAmount ?? 0) : undefined,
        other_taxable_allowances: bonosImponibles,
        non_taxable_allowances: { transport: movilizacion, meal: colacion, other: bonosNoImponibles },
        contract_type: "indefinite",
        afp_name: "Modelo",
        health_system: "fonasa",
        save_simulation: false,
      });
      netSalaryEstimate = result.net_salary;
    } catch (err) {
      console.error("[OPS] Error computing netSalaryEstimate on create puesto:", err);
    }
  }

  if (netSalaryEstimate != null) {
    await db.payrollSalaryStructure.update({
      where: { id: salaryStructure.id },
      data: { netSalaryEstimate },
    });
  }

  return { salaryStructureId: salaryStructure.id, netSalaryEstimate };
}
