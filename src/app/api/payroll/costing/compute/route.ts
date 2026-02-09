/**
 * POST /api/payroll/costing/compute
 * Calcula costo total empleador (usado por CPQ)
 */

import { NextRequest, NextResponse } from "next/server";
import { computeEmployerCost } from "@/modules/payroll/engine";
import type { EmployerCostInput } from "@/modules/payroll/engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validar input mínimo
    if (!body.base_salary_clp || typeof body.base_salary_clp !== "number" || body.base_salary_clp <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "base_salary_clp must be a positive number",
          },
        },
        { status: 400 }
      );
    }

    if (!body.contract_type || !["indefinite", "fixed_term"].includes(body.contract_type)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "contract_type must be 'indefinite' or 'fixed_term'",
          },
        },
        { status: 400 }
      );
    }

    // Ejecutar cálculo
    const input: EmployerCostInput = {
      base_salary_clp: body.base_salary_clp,
      contract_type: body.contract_type,
      afp_name: body.afp_name,
      health_system: body.health_system,
      health_plan_pct: body.health_plan_pct,
      work_injury_risk: body.work_injury_risk,
      overtime_hours_50: body.overtime_hours_50,
      commissions: body.commissions,
      transport_allowance: body.transport_allowance,
      meal_allowance: body.meal_allowance,
      num_dependents: body.num_dependents,
      has_maternal_allowance: body.has_maternal_allowance,
      params_version_id: body.params_version_id,
      uf_value: body.uf_value,
      uf_date: body.uf_date,
      utm_value: body.utm_value,
      utm_month: body.utm_month,
      assumptions: body.assumptions,
    };

    const result = await computeEmployerCost(input);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[PAYROLL] Error computing employer cost:", error);

    if (error.message?.includes("not found")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: error.message,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error.message || "Failed to compute employer cost",
        },
      },
      { status: 500 }
    );
  }
}
