/**
 * API Route: /api/cron/cashflow-sync
 * GET - Resync nightly de items materializados de cashflow para todos los tenants.
 *
 * Cubre drift de:
 *  - CONTRACT (CpqQuote): cambios masivos no instrumentados.
 *  - PAYROLL (dotación): cambios en SalaryStructure / activación de puestos.
 *  - TURNOS_EXTRA (rolling avg): refresca con datos de la última semana.
 *  - IVA F29 (próximos 3 meses).
 *  - RECURRING_DTE (templates): mirror de cualquier cambio de plantilla.
 *
 * Programado en vercel.json: schedule "0 4 * * *" (4 AM UTC ≈ 1 AM Chile).
 * Protegido con CRON_SECRET (Authorization: Bearer <secret>).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backfillContractItems } from "@/modules/finance/cashflow/generators/sales-contract-sync";
import { recomputePayrollAmounts } from "@/modules/finance/cashflow/generators/payroll-sync";
import { recomputeTurnosExtraAmounts } from "@/modules/finance/cashflow/generators/turnos-extra-sync";
import { recomputeIvaUpcoming } from "@/modules/finance/cashflow/generators/iva-f29-sync";
import { backfillRecurringDteItems } from "@/modules/finance/cashflow/generators/recurring-dte-sync";

interface TenantStats {
  tenantId: string;
  contracts: number;
  payroll: number;
  turnosExtra: number;
  iva: number;
  recurringDte: number;
  errors: string[];
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Tenants que tengan al menos un FinanceCashflowConfig (los inicializados).
  const configs = await prisma.financeCashflowConfig.findMany({
    select: {
      tenantId: true,
      autoSales: true,
      autoPayroll: true,
      autoTurnosExtra: true,
      autoIva: true,
      autoRecurringDte: true,
    },
  });

  const results: TenantStats[] = [];
  for (const cfg of configs) {
    const stats: TenantStats = {
      tenantId: cfg.tenantId,
      contracts: 0,
      payroll: 0,
      turnosExtra: 0,
      iva: 0,
      recurringDte: 0,
      errors: [],
    };
    try {
      if (cfg.autoSales) {
        const r = await backfillContractItems(cfg.tenantId);
        stats.contracts = r.created + r.updated + r.reactivated + r.deactivated;
      }
    } catch (err) {
      stats.errors.push(`contracts: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      if (cfg.autoPayroll) {
        const r = await recomputePayrollAmounts(cfg.tenantId);
        stats.payroll = r.created + r.updated + r.reactivated + r.deactivated;
      }
    } catch (err) {
      stats.errors.push(`payroll: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      if (cfg.autoTurnosExtra) {
        const r = await recomputeTurnosExtraAmounts(cfg.tenantId);
        stats.turnosExtra = r.created + r.updated + r.reactivated + r.deactivated;
      }
    } catch (err) {
      stats.errors.push(`turnos: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      if (cfg.autoIva) {
        const r = await recomputeIvaUpcoming(cfg.tenantId, 3);
        stats.iva = r.created + r.updated + r.reactivated + r.deactivated;
      }
    } catch (err) {
      stats.errors.push(`iva: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      if (cfg.autoRecurringDte) {
        const r = await backfillRecurringDteItems(cfg.tenantId);
        stats.recurringDte = r.created + r.updated + r.reactivated + r.deactivated;
      }
    } catch (err) {
      stats.errors.push(`recurring-dte: ${err instanceof Error ? err.message : String(err)}`);
    }
    results.push(stats);
  }

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    results,
  });
}
