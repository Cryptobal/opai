/**
 * Diagnostic: count FinanceAutoMatchRule per tenant + check why FT Foods
 * installation may not be seeing IVA / payroll projections in cashflow.
 * Read-only.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=".repeat(70));
  console.log("1) Reglas auto-match (FinanceAutoMatchRule) por tenant");
  console.log("=".repeat(70));

  const allRules = await prisma.financeAutoMatchRule.findMany({
    select: {
      id: true,
      tenantId: true,
      name: true,
      enabled: true,
      priority: true,
      appliesTo: true,
      timesMatched: true,
      lastMatchedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const byTenant = new Map<string, typeof allRules>();
  for (const r of allRules) {
    if (!byTenant.has(r.tenantId)) byTenant.set(r.tenantId, []);
    byTenant.get(r.tenantId)!.push(r);
  }

  if (allRules.length === 0) {
    console.log("Sin filas en FinanceAutoMatchRule en ningún tenant.");
  } else {
    for (const [tenantId, rules] of byTenant) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, slug: true },
      });
      console.log(
        `\nTenant ${tenant?.slug ?? tenantId} (${tenant?.name ?? "?"}) — ${rules.length} reglas:`
      );
      for (const r of rules) {
        console.log(
          `  [${r.enabled ? "ON " : "off"}] prio=${r.priority} "${r.name}" matched=${r.timesMatched}x ` +
            `last=${r.lastMatchedAt?.toISOString().slice(0, 10) ?? "—"} created=${r.createdAt.toISOString().slice(0, 10)}`
        );
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("2) FT Foods — proyecciones de flujo");
  console.log("=".repeat(70));

  const installation = await prisma.crmInstallation.findFirst({
    where: { name: { contains: "Ft Foods", mode: "insensitive" } },
    select: { id: true, tenantId: true, name: true, accountId: true },
  });

  if (!installation) {
    console.log("No encontré instalación 'Ft Foods'. Listando todas:");
    const all = await prisma.crmInstallation.findMany({
      select: { id: true, name: true, tenantId: true },
      orderBy: { name: "asc" },
    });
    console.log(all.map((i) => `  ${i.name} (${i.id})`).join("\n"));
    await prisma.$disconnect();
    return;
  }

  console.log(`\nInstalación: ${installation.name}`);
  console.log(`  id=${installation.id}`);
  console.log(`  tenantId=${installation.tenantId}`);
  console.log(`  accountId=${installation.accountId ?? "—"}`);

  // 2a — Cashflow config (auto flags)
  const cfg = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId: installation.tenantId },
    select: {
      autoSales: true,
      autoPayroll: true,
      autoTurnosExtra: true,
      autoIva: true,
      autoRecurringDte: true,
      payrollPayDay: true,
      ivaPayDay: true,
    },
  });
  console.log("\n2a) FinanceCashflowConfig:");
  console.log(cfg ? JSON.stringify(cfg, null, 2) : "  ❌ NO existe config para este tenant");

  // 2b — Category × Account mappings
  const catCount = await prisma.financeCashflowCategory.count({
    where: { tenantId: installation.tenantId, isActive: true },
  });
  const catAccCount = await prisma.financeCashflowCategoryAccount.count({
    where: { tenantId: installation.tenantId },
  });
  console.log(
    `\n2b) Categorías activas: ${catCount}, mapeos cuenta↔categoría: ${catAccCount}`
  );

  // List IVA / payroll categories specifically
  const ivaCats = await prisma.financeCashflowCategory.findMany({
    where: {
      tenantId: installation.tenantId,
      OR: [
        { code: { contains: "IVA", mode: "insensitive" } },
        { name: { contains: "IVA", mode: "insensitive" } },
        { code: { contains: "PAYROLL", mode: "insensitive" } },
        { name: { contains: "remuneraciones", mode: "insensitive" } },
        { name: { contains: "sueldos", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      isActive: true,
      accountPlanId: true,
      _count: { select: { accountMappings: true, items: true } },
    },
  });
  console.log("\n2c) Categorías IVA / Remuneraciones:");
  for (const c of ivaCats) {
    console.log(
      `  [${c.kind}] ${c.code} — ${c.name} active=${c.isActive} ` +
        `accountPlanId=${c.accountPlanId ? "set" : "—"} ` +
        `mappings=${c._count.accountMappings} items=${c._count.items}`
    );
  }

  // 2d — Cashflow items by source for this tenant
  const itemsBySource = await prisma.financeCashflowItem.groupBy({
    by: ["source"],
    where: { tenantId: installation.tenantId },
    _count: true,
  });
  console.log("\n2d) Items de flujo por origen (tenant entero):");
  for (const row of itemsBySource) {
    console.log(`  ${row.source}: ${row._count}`);
  }

  // 2e — Items linked specifically to FT Foods installation
  const ftItems = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId: installation.tenantId,
      installationId: installation.id,
    },
    select: {
      id: true,
      name: true,
      source: true,
      kind: true,
      isActive: true,
      recurrence: true,
      amount: true,
      currency: true,
      startDate: true,
      endDate: true,
      _count: { select: { occurrences: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`\n2e) Items de flujo vinculados a FT Foods: ${ftItems.length}`);
  for (const i of ftItems) {
    console.log(
      `  [${i.source}/${i.kind}] ${i.name} ${i.amount} ${i.currency} ` +
        `${i.recurrence} active=${i.isActive} occ=${i._count.occurrences} ` +
        `${i.startDate.toISOString().slice(0, 10)}→${i.endDate?.toISOString().slice(0, 10) ?? "∞"}`
    );
  }

  // 2f — Items linked via crmAccountId (FT Foods account)
  if (installation.accountId) {
    const acctItems = await prisma.financeCashflowItem.count({
      where: {
        tenantId: installation.tenantId,
        crmAccountId: installation.accountId,
      },
    });
    console.log(`\n2f) Items vinculados al CRM account de FT Foods: ${acctItems}`);
  }

  // 2g — Puestos operativos de FT Foods (driver de payroll-from-dotacion)
  const puestos = await prisma.opsPuestoOperativo.findMany({
    where: {
      tenantId: installation.tenantId,
      installationId: installation.id,
      active: true,
    },
    select: {
      id: true,
      name: true,
      active: true,
      salaryStructureId: true,
    },
  });
  console.log(`\n2g) Puestos operativos activos en FT Foods: ${puestos.length}`);
  const withSalary = puestos.filter((p) => p.salaryStructureId).length;
  console.log(`     con salaryStructureId: ${withSalary} (sin esto NO se proyecta payroll)`);

  // 2h — DTEs emitidos / recibidos del tenant que alimentan IVA F29
  const dteCount = await prisma.financeDte.count({
    where: { tenantId: installation.tenantId },
  });
  console.log(`\n2h) DTEs totales del tenant (drivers de IVA F29): ${dteCount}`);

  // 2i — Cuentas bancarias y plan de cuentas
  const bankAccs = await prisma.financeBankAccount.count({
    where: { tenantId: installation.tenantId },
  });
  const accountPlanCount = await prisma.financeAccountPlan.count({
    where: { tenantId: installation.tenantId },
  });
  console.log(
    `\n2i) FinanceBankAccount: ${bankAccs}, FinanceAccountPlan rows: ${accountPlanCount}`
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
