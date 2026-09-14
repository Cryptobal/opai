/**
 * API Route: /api/cron/bank-ledger-check
 *
 * Cuadratura diaria del libro mayor bancario. Para cada cuenta CLP activa:
 *  1. Toma la última lectura del banco (MANUAL / IMPORT / CALCULATED) de los
 *     últimos 30 días y recalcula EN VIVO el ledger a esa fecha.
 *  2. Si |lectura − ledger| ≥ 1 CLP, notifica `bank_balance_discrepancy` con
 *     el delta y el link a Cuadratura. También avisa si la cuenta no tiene
 *     saldo inicial (el saldo mostrado no es un ledger).
 *
 * Cualquier delta se reporta (el umbral del tenant solo decide si la nota es
 * obligatoria al registrar lecturas). Idempotente: no escribe en BD.
 *
 * Protegido con CRON_SECRET. Programado en vercel.json (12:00 UTC ≈ 8-9 AM Chile).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildReconciliationReport,
  evaluateBalanceDiscrepancy,
  getBankBalanceDiscrepancyThresholdClp,
} from "@/modules/finance/banking/bank-balance.service";
import { notifyBankBalanceDiscrepancy } from "@/modules/finance/banking/bank-balance-notify";
import { notify } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const accounts = await prisma.financeBankAccount.findMany({
      where: { isActive: true, currency: "CLP" },
      select: { id: true, tenantId: true, bankName: true, accountNumber: true },
    });

    const results: Array<{
      tenantId: string;
      bankAccountId: string;
      status: "ok" | "delta" | "needs_opening" | "no_reading" | "error";
      deltaClp?: number;
      asOfDate?: string;
      error?: string;
    }> = [];

    const thresholdByTenant = new Map<string, number>();

    for (const acc of accounts) {
      const label = `${acc.bankName} ${acc.accountNumber}`;
      try {
        const report = await buildReconciliationReport(acc.tenantId, acc.id, {
          days: 30,
        });

        if (report.needsOpening) {
          await notify({
            tenantId: acc.tenantId,
            type: "bank_balance_discrepancy",
            title: `Cuenta sin saldo inicial — ${label}`,
            body: `La cuenta ${label} no tiene saldo inicial: el saldo que muestra OPAI no se calcula desde los movimientos. Definilo en Finanzas → Bancos → Cuadratura.`,
            link: "/finanzas/bancos?tab=transactions",
            data: { bankAccountId: acc.id, kind: "needs_opening" },
          });
          results.push({ tenantId: acc.tenantId, bankAccountId: acc.id, status: "needs_opening" });
          continue;
        }

        const latest = report.latestReading;
        if (!latest || latest.ledgerAtDate == null || latest.deltaClp == null) {
          results.push({ tenantId: acc.tenantId, bankAccountId: acc.id, status: "no_reading" });
          continue;
        }

        if (Math.abs(latest.deltaClp) < 1) {
          results.push({
            tenantId: acc.tenantId,
            bankAccountId: acc.id,
            status: "ok",
            deltaClp: 0,
            asOfDate: latest.asOfDate,
          });
          continue;
        }

        let thresholdClp = thresholdByTenant.get(acc.tenantId);
        if (thresholdClp == null) {
          thresholdClp = await getBankBalanceDiscrepancyThresholdClp(acc.tenantId);
          thresholdByTenant.set(acc.tenantId, thresholdClp);
        }
        const discrepancy = evaluateBalanceDiscrepancy({
          reported: latest.balance,
          computed: latest.ledgerAtDate,
          thresholdClp,
          asOfDate: latest.asOfDate,
        });
        await notifyBankBalanceDiscrepancy({
          tenantId: acc.tenantId,
          accountLabel: label,
          discrepancy,
          link: "/finanzas/bancos?tab=transactions",
        });
        results.push({
          tenantId: acc.tenantId,
          bankAccountId: acc.id,
          status: "delta",
          deltaClp: latest.deltaClp,
          asOfDate: latest.asOfDate,
        });
      } catch (err) {
        console.error("[cron/bank-ledger-check] cuenta", acc.id, err);
        results.push({
          tenantId: acc.tenantId,
          bankAccountId: acc.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked: accounts.length,
      alerts: results.filter((r) => r.status === "delta" || r.status === "needs_opening").length,
      results,
    });
  } catch (error) {
    console.error("[cron/bank-ledger-check] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error" },
      { status: 500 },
    );
  }
}
