/**
 * PAYROLL ENGINE - Monthly payroll run
 * Executes liquidation for all active guards in a period.
 */

import { prisma } from "@/lib/prisma";
import { resolveSalaryStructure } from "./resolve-salary";
import { simulatePayslip } from "@/modules/payroll/engine/simulate-payslip";
import type { PayslipSimulationInput } from "@/modules/payroll/engine/types";

export interface RunPayrollOptions {
  periodId: string;
  tenantId: string;
  userId: string;
  installationId?: string; // optional filter
  guardiaId?: string; // optional single guard
}

export interface RunPayrollResult {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ guardiaId: string; name: string; error: string }>;
}

export async function runMonthlyPayroll(options: RunPayrollOptions): Promise<RunPayrollResult> {
  const { periodId, tenantId, userId, installationId, guardiaId } = options;

  const period = await prisma.payrollPeriod.findFirst({
    where: { id: periodId, tenantId },
  });
  if (!period) throw new Error("Período no encontrado");
  if (period.status === "PAID") throw new Error("El período ya está pagado");

  // Get guards to process
  const guardsWhere: any = {
    tenantId,
    status: "active",
    asignaciones: { some: { isActive: true } },
  };
  if (guardiaId) guardsWhere.id = guardiaId;
  if (installationId) {
    guardsWhere.asignaciones = { some: { isActive: true, installationId } };
  }

  const guards = await prisma.opsGuardia.findMany({
    where: guardsWhere,
    select: {
      id: true,
      personaId: true,
      contractType: true,
      montoAnticipo: true,
      recibeAnticipo: true,
      persona: {
        select: {
          firstName: true,
          lastName: true,
          afp: true,
          healthSystem: true,
          isapreHasExtraPercent: true,
          isapreExtraPercent: true,
        },
      },
      asignaciones: {
        where: { isActive: true },
        take: 1,
        select: { installationId: true, puestoId: true },
      },
    },
  });

  // Get attendance records for this period
  const attendanceRecords = await prisma.payrollAttendanceRecord.findMany({
    where: { periodId, tenantId },
  });
  const attendanceByGuard = new Map(attendanceRecords.map((r) => [r.guardiaId, r]));

  // Get anticipo items for this period
  const anticipoItems = await prisma.payrollAnticipoItem.findMany({
    where: {
      anticipoProcess: { periodId, status: { in: ["APPROVED", "PAID"] } },
    },
  });
  const anticipoByGuard = new Map(anticipoItems.map((i) => [i.guardiaId, Number(i.amount)]));

  // Update period status
  await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: { status: "PROCESSING" },
  });

  const result: RunPayrollResult = { total: guards.length, created: 0, skipped: 0, errors: [] };

  for (const guard of guards) {
    const name = `${guard.persona.firstName} ${guard.persona.lastName}`;
    try {
      // Check if liquidation already exists
      const existing = await prisma.payrollLiquidacion.findUnique({
        where: { periodId_guardiaId: { periodId, guardiaId: guard.id } },
      });
      if (existing && existing.status !== "DRAFT") {
        result.skipped++;
        continue;
      }

      // 1. Resolve salary structure
      const salary = await resolveSalaryStructure(guard.id);
      if (salary.source === "NONE" || salary.baseSalary <= 0) {
        result.skipped++;
        continue;
      }

      // 2. Get attendance
      const attendance = attendanceByGuard.get(guard.id);
      const daysWorked = attendance?.daysWorked ?? 30;
      const totalDaysMonth = attendance?.totalDaysMonth ?? 30;

      // 3. Calculate bonos
      let bonosImponibles = 0;
      let bonosNoImponibles = 0;
      for (const b of salary.bonos) {
        if (b.bonoType === "CONDICIONAL") {
          // Skip conditional bonos for now - they need evaluation
          // TODO: evaluate against attendance data
          continue;
        }
        if (b.isTaxable) bonosImponibles += b.amount;
        else bonosNoImponibles += b.amount;
      }

      // 4. Prepare simulation input
      const contractType = guard.contractType === "plazo_fijo" ? "fixed_term" : "indefinite";
      const afpName = guard.persona.afp || "Modelo";
      const healthSystem = (guard.persona.healthSystem === "isapre" ? "isapre" : "fonasa") as "fonasa" | "isapre";
      let healthPlanPct = 0.07;
      if (healthSystem === "isapre" && guard.persona.isapreHasExtraPercent && guard.persona.isapreExtraPercent) {
        healthPlanPct = Number(guard.persona.isapreExtraPercent) / 100;
      }

      const anticipo = anticipoByGuard.get(guard.id) ?? 0;

      const input: PayslipSimulationInput = {
        base_salary_clp: salary.baseSalary,
        other_taxable_allowances: bonosImponibles,
        non_taxable_allowances: {
          transport: salary.movilizacion,
          meal: salary.colacion,
          other: bonosNoImponibles,
        },
        worked_days: daysWorked,
        total_days_month: totalDaysMonth,
        contract_type: contractType,
        afp_name: afpName,
        health_system: healthSystem,
        health_plan_pct: healthPlanPct,
        overtime_hours_50: attendance ? Number(attendance.overtimeHours50) : 0,
        overtime_hours_100: attendance ? Number(attendance.overtimeHours100) : 0,
        additional_deductions: {
          advance: anticipo,
        },
        save_simulation: false,
      };

      if (salary.gratificationType === "CUSTOM") {
        input.gratification_clp = salary.gratificationCustomAmount;
      }

      // 5. Run simulation
      const result_sim = await simulatePayslip(input);

      // 6. Create/update liquidacion
      const liquidacionData = {
        tenantId,
        periodId,
        guardiaId: guard.id,
        personaId: guard.personaId,
        installationId: salary.installationId,
        puestoId: salary.puestoId,
        salaryStructureId: salary.structureId,
        salarySource: salary.source,
        attendanceSource: attendance?.source ?? "OPAI",
        daysWorked,
        totalDaysMonth,
        breakdown: {
          haberes: result_sim.haberes,
          deductions: result_sim.deductions,
          voluntaryDeductions: result_sim.voluntary_deductions,
          employerCost: result_sim.employer_cost,
          salaryStructure: {
            baseSalary: salary.baseSalary,
            colacion: salary.colacion,
            movilizacion: salary.movilizacion,
            bonos: salary.bonos,
          },
        },
        grossSalary: result_sim.haberes.gross_salary,
        netSalary: result_sim.net_salary,
        totalDeductions: result_sim.total_deductions,
        employerCost: result_sim.total_employer_cost,
        status: "DRAFT",
        parametersSnapshot: result_sim.parameters_snapshot,
      };

      if (existing) {
        await prisma.payrollLiquidacion.update({
          where: { id: existing.id },
          data: liquidacionData as any,
        });
      } else {
        await prisma.payrollLiquidacion.create({
          data: liquidacionData as any,
        });
      }

      result.created++;
    } catch (err: any) {
      result.errors.push({ guardiaId: guard.id, name, error: err.message });
    }
  }

  // Update period status
  await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: { status: "OPEN" },
  });

  return result;
}
