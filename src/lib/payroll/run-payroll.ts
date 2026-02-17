/**
 * PAYROLL ENGINE - Monthly payroll run
 * Executes liquidation for all active guards in a period.
 */

import { prisma } from "@/lib/prisma";
import { resolveSalaryStructure } from "./resolve-salary";
import { countHolidayHoursWorked } from "./chilean-holidays";
import { simulatePayslip } from "@/modules/payroll/engine/simulate-payslip";
import type { PayslipSimulationInput } from "@/modules/payroll/engine/types";

export interface RunPayrollOptions {
  periodId: string;
  tenantId: string;
  userId: string;
  installationId?: string; // optional filter
  guardiaId?: string; // optional single guard
}

export interface SkippedGuard {
  guardiaId: string;
  name: string;
  rut: string;
  reason: string;
  reasonCode: "NO_SALARY" | "NO_ASSIGNMENT" | "ALREADY_PAID" | "ZERO_SALARY" | "ERROR";
  /** Link suggestion to fix the issue */
  fixLink?: string;
  fixLabel?: string;
}

export interface RunPayrollResult {
  total: number;
  created: number;
  skipped: number;
  skippedDetails: SkippedGuard[];
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
          rut: true,
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

  const result: RunPayrollResult = { total: guards.length, created: 0, skipped: 0, skippedDetails: [], errors: [] };

  for (const guard of guards) {
    const name = `${guard.persona.firstName} ${guard.persona.lastName}`;
    const rut = guard.persona.rut || "";
    try {
      // Check if liquidation already exists and is paid
      const existing = await prisma.payrollLiquidacion.findUnique({
        where: { periodId_guardiaId: { periodId, guardiaId: guard.id } },
      });
      if (existing && existing.status !== "DRAFT") {
        result.skipped++;
        result.skippedDetails.push({
          guardiaId: guard.id, name, rut,
          reason: "Ya tiene liquidación en estado " + existing.status,
          reasonCode: "ALREADY_PAID",
        });
        continue;
      }

      // Check assignment
      if (!guard.asignaciones || guard.asignaciones.length === 0) {
        result.skipped++;
        result.skippedDetails.push({
          guardiaId: guard.id, name, rut,
          reason: "Sin asignación activa a un puesto operativo",
          reasonCode: "NO_ASSIGNMENT",
          fixLink: `/personas/guardias/${guard.id}`,
          fixLabel: "Ir a ficha del guardia",
        });
        continue;
      }

      // 1. Resolve salary structure
      const salary = await resolveSalaryStructure(guard.id);
      if (salary.source === "NONE" || salary.baseSalary <= 0) {
        result.skipped++;
        const puestoId = guard.asignaciones[0]?.puestoId;
        const instId = guard.asignaciones[0]?.installationId;
        result.skippedDetails.push({
          guardiaId: guard.id, name, rut,
          reason: salary.baseSalary <= 0
            ? "Sueldo base es $0 en el puesto asignado"
            : "Sin estructura de sueldo configurada en el puesto",
          reasonCode: salary.baseSalary <= 0 ? "ZERO_SALARY" : "NO_SALARY",
          fixLink: instId ? `/crm/installations/${instId}` : undefined,
          fixLabel: instId ? "Ir a la instalación para configurar sueldo" : undefined,
        });
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

      // Calculate holiday hours from attendance daily detail
      let holidayHoursWorked = 0;
      if (attendance?.dailyDetail) {
        const dailyArr = Array.isArray(attendance.dailyDetail) ? attendance.dailyDetail as any[] : [];
        const { holidayHoursWorked: hh } = await countHolidayHoursWorked(
          tenantId,
          period.year,
          period.month,
          dailyArr,
          12 // default shift hours for security guards
        );
        holidayHoursWorked = hh;
      }

      const input: PayslipSimulationInput = {
        base_salary_clp: salary.baseSalary,
        other_taxable_allowances: bonosImponibles,
        holiday_hours_worked: holidayHoursWorked,
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
          guardInfo: {
            afpName: afpName,
            healthSystem: healthSystem,
            healthPlanPct: healthPlanPct,
            contractType: contractType,
            holidayHoursWorked: holidayHoursWorked,
            holidayDaysWorked: Math.round(holidayHoursWorked / 12),
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
      result.skippedDetails.push({
        guardiaId: guard.id, name, rut,
        reason: `Error: ${err.message}`,
        reasonCode: "ERROR",
        fixLink: `/personas/guardias/${guard.id}`,
        fixLabel: "Ir a ficha del guardia",
      });
    }
  }

  // Detect guards with attendance but no liquidation (not in the processed set)
  const processedGuardIds = new Set(guards.map((g) => g.id));
  const attendanceGuardIds = [...attendanceByGuard.keys()];
  const unprocessedFromAttendance = attendanceGuardIds.filter((gid) => !processedGuardIds.has(gid));

  if (unprocessedFromAttendance.length > 0) {
    const unprocessedGuards = await prisma.opsGuardia.findMany({
      where: { id: { in: unprocessedFromAttendance } },
      select: {
        id: true,
        status: true,
        persona: { select: { rut: true, firstName: true, lastName: true } },
        asignaciones: { where: { isActive: true }, take: 1, select: { installationId: true } },
      },
    });

    for (const ug of unprocessedGuards) {
      const ugName = `${ug.persona.firstName} ${ug.persona.lastName}`;
      const ugRut = ug.persona.rut || "";

      if (ug.status !== "active") {
        result.skippedDetails.push({
          guardiaId: ug.id, name: ugName, rut: ugRut,
          reason: `Guardia inactivo (estado: ${ug.status})`,
          reasonCode: "NO_ASSIGNMENT",
          fixLink: `/personas/guardias/${ug.id}`,
          fixLabel: "Ir a ficha del guardia",
        });
      } else if (!ug.asignaciones || ug.asignaciones.length === 0) {
        result.skippedDetails.push({
          guardiaId: ug.id, name: ugName, rut: ugRut,
          reason: "Tiene asistencia cargada pero no tiene asignación activa a un puesto",
          reasonCode: "NO_ASSIGNMENT",
          fixLink: `/personas/guardias/${ug.id}`,
          fixLabel: "Ir a ficha del guardia para asignar",
        });
      } else {
        const instId = ug.asignaciones[0]?.installationId;
        result.skippedDetails.push({
          guardiaId: ug.id, name: ugName, rut: ugRut,
          reason: "Tiene asistencia y asignación pero falta estructura de sueldo en el puesto",
          reasonCode: "NO_SALARY",
          fixLink: instId ? `/crm/installations/${instId}` : `/personas/guardias/${ug.id}`,
          fixLabel: instId ? "Ir a instalación para configurar sueldo" : "Ir a ficha del guardia",
        });
      }
      result.skipped++;
    }
  }

  // Update period status and save skipped details
  await prisma.payrollPeriod.update({
    where: { id: periodId },
    data: {
      status: "OPEN",
      notes: JSON.stringify({
        lastRun: new Date().toISOString(),
        created: result.created,
        skipped: result.skipped,
        skippedDetails: result.skippedDetails,
        errors: result.errors,
      }),
    },
  });

  result.total = result.created + result.skipped;
  return result;
}
