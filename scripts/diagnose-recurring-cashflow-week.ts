/**
 * Diagnóstico: plantillas recurrentes día N vs bucket semanal en flujo de caja.
 * Uso: npx tsx scripts/diagnose-recurring-cashflow-week.ts --tenant gard [--dom 20]
 */
import { PrismaClient } from "@prisma/client";
import {
  bucketKeyFor,
  bucketBoundsFor,
  expandRecurrence,
  itemForRecurrenceExpansion,
} from "../src/modules/finance/cashflow/recurrence-engine";
import { filterCashflowItemsForProjection } from "../src/modules/finance/cashflow/projection-item-filter";

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = process.argv.includes("--tenant")
    ? process.argv[process.argv.indexOf("--tenant") + 1]
    : "gard";
  const domFilter = process.argv.includes("--dom")
    ? Number(process.argv[process.argv.indexOf("--dom") + 1])
    : null;

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant no encontrado:", tenantSlug);
    process.exit(1);
  }

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      ...(domFilter != null ? { dayOfMonth: domFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      dayOfMonth: true,
      frequency: true,
      startDate: true,
      crmAccountId: true,
      installationId: true,
    },
    orderBy: { name: "asc" },
  });

  const mirrors = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId: tenant.id,
      source: "RECURRING_DTE",
      isActive: true,
      ...(domFilter != null ? { dayOfMonth: domFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      dayOfMonth: true,
      sourceRefId: true,
      crmAccountId: true,
      installationId: true,
      recurrence: true,
      startDate: true,
      endDate: true,
      diasCobroDesdeFactura: true,
      emiteProforma: true,
    },
  });

  const contracts = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      source: { in: ["CONTRACT", "OTHER"] },
    },
    select: {
      id: true,
      name: true,
      dayOfMonth: true,
      source: true,
      crmAccountId: true,
      installationId: true,
    },
  });

  const filtered = filterCashflowItemsForProjection([
    ...mirrors,
    ...contracts,
  ]);

  const hiddenContracts = contracts.filter(
    (c) =>
      c.crmAccountId &&
      !filtered.some(
        (f) =>
          f.id === c.id ||
          (f.source === "RECURRING_DTE" &&
            f.crmAccountId === c.crmAccountId &&
            f.installationId === c.installationId),
      ),
  );

  console.log(`\n=== ${tenant.name} (${tenantSlug}) ===`);
  console.log(`Plantillas activas${domFilter != null ? ` dom=${domFilter}` : ""}: ${templates.length}`);
  console.log(`Espejos RECURRING_DTE activos: ${mirrors.length}`);
  console.log(`CONTRACT activos ocultos por recurrente: ${hiddenContracts.length}`);

  const horizonFrom = new Date(Date.UTC(2026, 5, 1));
  const horizonTo = new Date(Date.UTC(2026, 6, 31));

  console.log("\n--- Proyección virtual jun–jul 2026 (ISO semanal) ---\n");

  for (const m of mirrors) {
    const inProj = filtered.some((f) => f.id === m.id);
    if (!inProj) continue;

    const dates = expandRecurrence(
      itemForRecurrenceExpansion({
        ...m,
        recurrence: m.recurrence,
        dayOfWeek: null,
        monthOfYear: null,
        diaEmisionProforma: null,
        diasFacturaDesdeProforma: null,
        diaEmisionFactura: null,
        mesFacturaRelativo: "MISMO_MES",
      }),
      horizonFrom,
      horizonTo,
    );

    const juneJuly = dates.filter((d) => {
      const y = d.getUTCFullYear();
      const mo = d.getUTCMonth();
      return y === 2026 && (mo === 5 || mo === 6);
    });

    if (juneJuly.length === 0) continue;

    const tpl = templates.find((t) => t.id === m.sourceRefId);
    const contractDup = contracts.find(
      (c) =>
        c.crmAccountId === m.crmAccountId &&
        c.installationId === m.installationId,
    );

    console.log(`• ${m.name}`);
    console.log(
      `  tpl.dayOfMonth=${tpl?.dayOfMonth ?? "?"} item.dayOfMonth=${m.dayOfMonth} proyecta=${inProj ? "sí" : "NO"}`,
    );
    if (contractDup) {
      console.log(
        `  CONTRACT paralelo: ${contractDup.name} dom=${contractDup.dayOfMonth} (${hiddenContracts.some((h) => h.id === contractDup.id) ? "oculto" : "visible"})`,
      );
    }

    for (const d of juneJuly) {
      const bounds = bucketBoundsFor(d, "weekly");
      const key = bucketKeyFor(d, "weekly");
      console.log(
        `  → ${d.toISOString().slice(0, 10)}  ${key}  ${bounds.label}  (${bounds.start.toISOString().slice(0, 10)}..${bounds.end.toISOString().slice(0, 10)})`,
      );
    }

    const dtes = await prisma.financeDte.findMany({
      where: {
        tenantId: tenant.id,
        crmAccountId: m.crmAccountId ?? undefined,
        installationId: m.installationId ?? undefined,
        date: { gte: horizonFrom, lte: horizonTo },
        direction: "ISSUED",
        siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
      },
      select: { date: true, folio: true, siiStatus: true },
      orderBy: { date: "asc" },
    });
    if (dtes.length > 0) {
      console.log("  DTEs jun–jul:");
      for (const dt of dtes) {
        const b = bucketKeyFor(dt.date, "weekly");
        console.log(
          `    · ${dt.date.toISOString().slice(0, 10)} folio=${dt.folio ?? "borrador"} ${dt.siiStatus} → ${b}`,
        );
      }
    }
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
