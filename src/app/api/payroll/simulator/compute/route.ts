/**
 * POST /api/payroll/simulator/compute
 * Simula liquidación completa de sueldo
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { simulatePayslip } from "@/modules/payroll/engine";
import type { PayslipSimulationInput } from "@/modules/payroll/engine";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(req: NextRequest) {
  const modCheck = await requireTenantModule('payroll');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

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

    if (!body.afp_name) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "afp_name is required",
          },
        },
        { status: 400 }
      );
    }

    if (!body.health_system || !["fonasa", "isapre"].includes(body.health_system)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "health_system must be 'fonasa' or 'isapre'",
          },
        },
        { status: 400 }
      );
    }

    // Ejecutar simulación
    const input: PayslipSimulationInput = {
      base_salary_clp: body.base_salary_clp,
      gratification_clp: body.gratification_clp,
      overtime_hours_50: body.overtime_hours_50,
      overtime_hours_100: body.overtime_hours_100,
      commissions: body.commissions,
      other_taxable_allowances: body.other_taxable_allowances,
      non_taxable_allowances: body.non_taxable_allowances,
      worked_days: body.worked_days,
      total_days_month: body.total_days_month,
      absence_days: body.absence_days,
      contract_type: body.contract_type,
      afp_name: body.afp_name,
      health_system: body.health_system,
      health_plan_pct: body.health_plan_pct,
      num_dependents: body.num_dependents,
      has_maternal_allowance: body.has_maternal_allowance,
      has_invalidity_allowance: body.has_invalidity_allowance,
      additional_deductions: body.additional_deductions,
      params_version_id: body.params_version_id,
      uf_value: body.uf_value,
      uf_date: body.uf_date,
      utm_value: body.utm_value,
      utm_month: body.utm_month,
      save_simulation: body.save_simulation,
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
    };

    const result = await simulatePayslip(input);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("[PAYROLL] Error simulating payslip:", error);

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
          message: error.message || "Failed to simulate payslip",
        },
      },
      { status: 500 }
    );
  }
}
