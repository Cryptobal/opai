import "server-only";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { todayChileStr } from "@/lib/fx-date";
import { computeF29Period } from "@/modules/finance/billing/f29.service";
import { computeProjectedF29ForPeriod } from "./load-committed-expense-params";
import {
  computeOriginalPayYmd,
  computePostponedPayYmd,
  type IvaPostponementRef,
} from "./iva-postponement";
import { weekStartYmd, ymdToDate } from "./weeks";
import { assertV3WeeksWritable } from "./weekly-close.adapter";

export async function loadIvaPostponements(
  tenantId: string,
): Promise<Map<string, IvaPostponementRef>> {
  const rows = await prisma.financeIvaPostponement.findMany({
    where: { tenantId },
    select: { taxPeriod: true, postponedPayDate: true },
  });
  return new Map(
    rows.map((r) => [
      r.taxPeriod,
      {
        taxPeriod: r.taxPeriod,
        postponedPayYmd: r.postponedPayDate.toISOString().slice(0, 10),
      },
    ]),
  );
}

function weekOf(ymd: string): string {
  const d = ymdToDate(ymd);
  if (!d) throw new Error(`Fecha inválida: ${ymd}`);
  return weekStartYmd(d);
}

function isTaxPeriodClosed(taxPeriod: string, todayYmd: string): boolean {
  const [y, mo] = taxPeriod.split("-").map(Number);
  const periodEnd = new Date(Date.UTC(y, mo, 1));
  const today = new Date(`${todayYmd}T00:00:00.000Z`);
  return periodEnd.getTime() <= today.getTime();
}

async function resolveIvaDeterminadoClp(
  tenantId: string,
  taxPeriod: string,
  todayYmd: string,
  ppmRatePct: number,
): Promise<number> {
  if (isTaxPeriodClosed(taxPeriod, todayYmd)) {
    const f29 = await computeF29Period(tenantId, taxPeriod);
    return f29.f29.ivaDeterminado;
  }
  const projected = await computeProjectedF29ForPeriod({
    tenantId,
    taxPeriod,
    todayYmd,
    ppmRatePct,
  });
  return projected.ivaDeterminado;
}

export async function postponeIva(args: {
  tenantId: string;
  taxPeriod: string;
  createdBy: string;
}): Promise<{
  taxPeriod: string;
  originalPayDate: string;
  postponedPayDate: string;
  deferredAmountClp: number;
}> {
  const { tenantId, taxPeriod, createdBy } = args;
  if (!/^\d{4}-\d{2}$/.test(taxPeriod)) {
    throw new Error("Período inválido (YYYY-MM)");
  }

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { ivaPayDay: true, ivaPostponedPayDay: true, ppmRatePct: true },
  });
  const ivaPayDay = config?.ivaPayDay ?? 12;
  const ivaPostponedPayDay = config?.ivaPostponedPayDay ?? 20;
  const ppmRatePct = Number(config?.ppmRatePct ?? 0);

  const originalPayYmd = computeOriginalPayYmd(taxPeriod, ivaPayDay);
  const postponedPayYmd = computePostponedPayYmd(originalPayYmd, ivaPostponedPayDay);
  const todayYmd = todayChileStr();
  const ivaDeterminado = await resolveIvaDeterminadoClp(
    tenantId,
    taxPeriod,
    todayYmd,
    ppmRatePct,
  );
  const deferredAmountClp = Math.max(0, Math.round(ivaDeterminado));
  if (deferredAmountClp === 0) {
    throw new Error(`No hay IVA determinado que postergar en el período ${taxPeriod}`);
  }

  await assertV3WeeksWritable(tenantId, [weekOf(originalPayYmd), weekOf(postponedPayYmd)]);

  await prisma.financeIvaPostponement.upsert({
    where: { tenantId_taxPeriod: { tenantId, taxPeriod } },
    create: {
      tenantId,
      taxPeriod,
      originalPayDate: ymdToDate(originalPayYmd)!,
      postponedPayDate: ymdToDate(postponedPayYmd)!,
      deferredAmountClp,
      createdBy,
    },
    update: {
      originalPayDate: ymdToDate(originalPayYmd)!,
      postponedPayDate: ymdToDate(postponedPayYmd)!,
      deferredAmountClp,
      createdBy,
    },
  });

  await logAudit({
    action: "UPDATE",
    entity: "FinanceIvaPostponement",
    entityId: taxPeriod,
    tenantId,
    userId: createdBy,
    details: { originalPayYmd, postponedPayYmd, deferredAmountClp },
  });

  return {
    taxPeriod,
    originalPayDate: originalPayYmd,
    postponedPayDate: postponedPayYmd,
    deferredAmountClp,
  };
}

export async function undoIvaPostponement(args: {
  tenantId: string;
  taxPeriod: string;
  userId: string;
}): Promise<{ taxPeriod: string }> {
  const { tenantId, taxPeriod, userId } = args;
  if (!/^\d{4}-\d{2}$/.test(taxPeriod)) {
    throw new Error("Período inválido (YYYY-MM)");
  }

  const existing = await prisma.financeIvaPostponement.findUnique({
    where: { tenantId_taxPeriod: { tenantId, taxPeriod } },
  });
  if (!existing) {
    throw new Error(`No hay postergación de IVA en el período ${taxPeriod}`);
  }

  const originalPayYmd = existing.originalPayDate.toISOString().slice(0, 10);
  const postponedPayYmd = existing.postponedPayDate.toISOString().slice(0, 10);
  const postponedBillingPeriod = postponedPayYmd.slice(0, 7);

  await assertV3WeeksWritable(tenantId, [weekOf(originalPayYmd), weekOf(postponedPayYmd)]);

  await prisma.$transaction([
    prisma.financeIvaPostponement.delete({
      where: { tenantId_taxPeriod: { tenantId, taxPeriod } },
    }),
    prisma.financeCashflowMilestoneDateOverride.deleteMany({
      where: {
        tenantId,
        milestoneKey: "iva_postergado",
        billingPeriod: postponedBillingPeriod,
      },
    }),
  ]);

  await logAudit({
    action: "DELETE",
    entity: "FinanceIvaPostponement",
    entityId: taxPeriod,
    tenantId,
    userId,
    details: { originalPayYmd, postponedPayYmd },
  });

  return { taxPeriod };
}
