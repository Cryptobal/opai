/**
 * Backfill espejos RECURRING_DTE desde plantillas (standalone, sin server-only).
 * Uso: npx tsx scripts/backfill-recurring-fc-mirrors.ts --tenant gard
 */
import { config } from "dotenv";
import { PrismaClient, type Prisma } from "@prisma/client";

config({ path: ".env.local" });

const prisma = new PrismaClient();
const SALES_CATEGORY_CODE = "ING_VENTA_CONTRATO";

type RecurringLine = {
  quantity?: number | string;
  unitPrice?: number | string;
  unitPriceUf?: number | string;
  discountPct?: number | string;
  priceCurrency?: "CLP" | "UF";
};

function resolveLinePriceCurrency(
  line: RecurringLine,
  templateCurrency: string,
): "CLP" | "UF" {
  if (line.priceCurrency === "UF" || line.priceCurrency === "CLP") {
    return line.priceCurrency;
  }
  if (templateCurrency === "UF" || line.unitPriceUf != null) return "UF";
  return "CLP";
}

function inferRecurringItemCurrency(
  templateCurrency: string,
  lines: RecurringLine[],
): "CLP" | "UF" {
  if (templateCurrency === "UF") return "UF";
  if (lines.length === 0) return "CLP";
  let clpSub = 0;
  let ufSub = 0;
  for (const l of lines) {
    const linePc = resolveLinePriceCurrency(l, templateCurrency);
    const qty = Number(l.quantity ?? 1);
    const disc = Number(l.discountPct ?? 0) / 100;
    if (linePc === "UF") {
      ufSub += qty * Number(l.unitPriceUf ?? 0) * (1 - disc);
    } else {
      clpSub += qty * Number(l.unitPrice ?? 0) * (1 - disc);
    }
  }
  if (ufSub > 0 && clpSub <= 0) return "UF";
  return "CLP";
}

const FREQUENCY_TO_RECURRENCE: Record<
  string,
  "MONTHLY" | "BIWEEKLY" | "WEEKLY" | "YEARLY"
> = {
  monthly: "MONTHLY",
  biweekly: "BIWEEKLY",
  weekly: "WEEKLY",
  yearly: "YEARLY",
};

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

async function syncRecurringDteItem(
  tenantId: string,
  templateId: string,
): Promise<{ action: SyncAction; templateName?: string }> {
  const tpl = await prisma.financeDteRecurringTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: {
      id: true,
      name: true,
      receiverName: true,
      currency: true,
      lines: true,
      frequency: true,
      dayOfMonth: true,
      dayOfWeek: true,
      monthOfYear: true,
      startDate: true,
      endDate: true,
      ufFixingPolicy: true,
      ufFixingDay: true,
      installationId: true,
      crmAccountId: true,
      contractDocumentId: true,
      isActive: true,
    },
  });
  if (!tpl) return { action: "noop" };

  if (tpl.contractDocumentId) {
    const doc = await prisma.document.findFirst({
      where: { id: tpl.contractDocumentId, tenantId },
      select: { id: true },
    });
    if (!doc) {
      await prisma.financeDteRecurringTemplate.updateMany({
        where: { id: tpl.id, tenantId },
        data: { isActive: false },
      });
      const existing = await prisma.financeCashflowItem.findFirst({
        where: { tenantId, source: "RECURRING_DTE", sourceRefId: templateId },
      });
      if (existing?.isActive) {
        await prisma.financeCashflowItem.update({
          where: { id: existing.id },
          data: { isActive: false },
        });
        return { action: "deactivated", templateName: tpl.name };
      }
      return { action: "noop", templateName: tpl.name };
    }
  }

  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: SALES_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return { action: "noop", templateName: tpl.name };

  const lines = (tpl.lines as RecurringLine[] | null) ?? [];
  const itemCurrency = inferRecurringItemCurrency(tpl.currency, lines);
  const subtotal = lines.reduce((s, l) => {
    const linePc = resolveLinePriceCurrency(l, tpl.currency);
    if (linePc !== itemCurrency) return s;
    const qty = Number(l.quantity ?? 1);
    const price =
      linePc === "UF"
        ? Number(l.unitPriceUf ?? 0)
        : Number(l.unitPrice ?? 0);
    const disc = Number(l.discountPct ?? 0) / 100;
    return s + qty * price * (1 - disc);
  }, 0);

  const amount = subtotal;
  const amountActive = tpl.isActive && subtotal > 0;

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "RECURRING_DTE", sourceRefId: templateId },
  });

  if (!amountActive) {
    if (existing && existing.isActive) {
      await prisma.financeCashflowItem.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return { action: "deactivated", templateName: tpl.name };
    }
    return { action: "noop", templateName: tpl.name };
  }

  const recurrence = FREQUENCY_TO_RECURRENCE[tpl.frequency] ?? "MONTHLY";
  const data = {
    tenantId,
    categoryId: cat.id,
    kind: "INCOME" as const,
    source: "RECURRING_DTE" as const,
    sourceRefId: tpl.id,
    name: `DTE recurrente · ${tpl.name}`,
    description: `${tpl.receiverName} · ${tpl.currency}`,
    amount: Math.round(amount * 100) / 100,
    currency: itemCurrency,
    ufFixingPolicy: tpl.ufFixingPolicy,
    ufFixingDay: tpl.ufFixingDay,
    recurrence,
    dayOfMonth:
      recurrence === "MONTHLY" || recurrence === "YEARLY"
        ? (tpl.dayOfMonth ?? new Date(tpl.startDate).getDate())
        : null,
    dayOfWeek:
      recurrence === "WEEKLY" || recurrence === "BIWEEKLY"
        ? (tpl.dayOfWeek ?? new Date(tpl.startDate).getDay())
        : null,
    monthOfYear: recurrence === "YEARLY" ? tpl.monthOfYear : null,
    startDate: tpl.startDate,
    endDate: tpl.endDate,
    installationId: tpl.installationId,
    crmAccountId: tpl.crmAccountId,
    isActive: true,
  };

  if (existing) {
    const scheduleChanged =
      existing.recurrence !== data.recurrence ||
      existing.dayOfMonth !== data.dayOfMonth ||
      existing.dayOfWeek !== data.dayOfWeek ||
      existing.monthOfYear !== data.monthOfYear ||
      existing.startDate.getTime() !== data.startDate.getTime() ||
      (existing.endDate?.getTime() ?? null) !== (data.endDate?.getTime() ?? null);
    if (scheduleChanged) {
      await prisma.financeCashflowOccurrence.deleteMany({
        where: {
          tenantId,
          itemId: existing.id,
          status: "PROJECTED",
          dteId: null,
          bankTransactionId: null,
        },
      });
    }
    await prisma.financeCashflowItem.update({ where: { id: existing.id }, data });
    return {
      action: existing.isActive ? "updated" : "reactivated",
      templateName: tpl.name,
    };
  }
  await prisma.financeCashflowItem.create({ data });
  return { action: "created", templateName: tpl.name };
}

async function main() {
  const tenantSlug = process.argv.includes("--tenant")
    ? process.argv[process.argv.indexOf("--tenant") + 1]
    : "gard";

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant no encontrado:", tenantSlug);
    process.exit(1);
  }

  const tpls = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const stats = { created: 0, updated: 0, reactivated: 0, deactivated: 0, noop: 0 };
  const log: string[] = [];

  for (const t of tpls) {
    const r = await syncRecurringDteItem(tenant.id, t.id);
    stats[r.action === "noop" ? "noop" : r.action]++;
    if (r.action !== "noop") {
      log.push(`${r.action.padEnd(11)} ${r.templateName ?? t.name}`);
    }
  }

  console.log(`\n# Backfill FC — ${tenant.name}\n`);
  console.log(
    `Creados: ${stats.created} | Actualizados: ${stats.updated} | Reactivados: ${stats.reactivated} | Desactivados: ${stats.deactivated} | Sin cambio: ${stats.noop}\n`,
  );
  if (log.length) {
    console.log("Detalle:\n");
    for (const line of log) console.log(`  ${line}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
