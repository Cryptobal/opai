/**
 * POST /api/crm/leads/employer-cost-preview
 * Costo empleador por guardia (misma lógica que puestos CPQ / payroll engine).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { buildCpqStyleEmployerCostInput } from "@/lib/cpq/cpq-employer-cost-input";
import { requireTenantModule } from '@/lib/require-module';

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "leads");
    if (forbidden) return forbidden;

    const body = await req.json();
    const positions = body?.positions as Array<{ baseSalary?: number }> | undefined;
    const ufValue = body?.ufValue as number | null | undefined;

    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json(
        { success: false, error: "positions[] requerido" },
        { status: 400 }
      );
    }

    const uniqueSalaries = new Map<number, number[]>();
    positions.forEach((p, idx) => {
      const sal = Math.round(Number(p.baseSalary) || 550000);
      if (!uniqueSalaries.has(sal)) uniqueSalaries.set(sal, []);
      uniqueSalaries.get(sal)!.push(idx);
    });

    const payrollBySalary = new Map<
      number,
      { employerCostPerGuard: number; netSalary: number }
    >();

    for (const sal of uniqueSalaries.keys()) {
      const payroll = await computeEmployerCost(
        buildCpqStyleEmployerCostInput(sal, { ufValue })
      );
      payrollBySalary.set(sal, {
        employerCostPerGuard: payroll.monthly_employer_cost_clp,
        netSalary: payroll.worker_net_salary_estimate,
      });
    }

    const items = positions.map((p, i) => {
      const sal = Math.round(Number(p.baseSalary) || 550000);
      const row = payrollBySalary.get(sal)!;
      return {
        index: i,
        baseSalary: sal,
        employerCostPerGuard: row.employerCostPerGuard,
        netSalary: row.netSalary,
      };
    });

    return NextResponse.json({ success: true, data: { items } });
  } catch (e) {
    console.error("[employer-cost-preview]", e);
    return NextResponse.json(
      { success: false, error: "Error al calcular costo empleador" },
      { status: 500 }
    );
  }
}
