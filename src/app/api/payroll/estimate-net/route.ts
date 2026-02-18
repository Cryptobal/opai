/**
 * POST /api/payroll/estimate-net
 * Estima el sueldo líquido dado una estructura de sueldo.
 * Usa el motor simulatePayslip() existente con valores por defecto.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { simulatePayslip } from "@/modules/payroll/engine/simulate-payslip";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await req.json();
    const {
      baseSalary,
      colacion = 0,
      movilizacion = 0,
      gratificationType = "AUTO_25",
      gratificationCustomAmount = 0,
      bonosImponibles = 0,
      bonosNoImponibles = 0,
      contractType = "indefinite",
      afpName = "Modelo",
      healthSystem = "fonasa",
    } = body;

    if (!baseSalary || baseSalary <= 0) {
      return NextResponse.json(
        { error: "baseSalary es requerido y debe ser mayor a 0" },
        { status: 400 }
      );
    }

    const result = await simulatePayslip({
      base_salary_clp: baseSalary,
      gratification_clp: gratificationType === "CUSTOM" ? gratificationCustomAmount : undefined,
      other_taxable_allowances: bonosImponibles,
      non_taxable_allowances: {
        transport: movilizacion,
        meal: colacion,
        other: bonosNoImponibles,
      },
      contract_type: contractType,
      afp_name: afpName,
      health_system: healthSystem,
      save_simulation: false,
    });

    return NextResponse.json({
      data: {
        grossSalary: result.haberes.gross_salary,
        totalTaxable: result.haberes.total_taxable,
        totalNonTaxable: result.haberes.total_non_taxable,
        netSalary: result.net_salary,
        totalDeductions: result.total_deductions,
        deductions: {
          afp: result.deductions.afp.amount,
          afpRate: result.deductions.afp.total_rate,
          health: result.deductions.health.amount,
          healthRate: result.deductions.health.rate,
          afc: result.deductions.afc.amount,
          afcRate: result.deductions.afc.total_rate,
          tax: result.deductions.tax.amount,
        },
        breakdown: {
          baseSalary: result.haberes.base_salary,
          gratification: result.haberes.gratification,
          colacion: result.haberes.meal,
          movilizacion: result.haberes.transport,
          bonosImponibles,
          bonosNoImponibles,
          totalTaxable: result.haberes.total_taxable,
          totalNonTaxable: result.haberes.total_non_taxable,
        },
        employerCost: result.total_employer_cost,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/payroll/estimate-net]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
