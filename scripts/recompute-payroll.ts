/**
 * One-shot: refresca todos los items de payroll del cashflow para cada tenant.
 * Garantiza que cada instalación con dotación activa tenga sus dos items
 * (PAYROLL_LIQUIDO + PAYROLL_PREVIRED) creados/actualizados con montos correctos.
 *
 * Duplica la lógica de payroll-sync.ts inline para evitar la dependencia
 * `server-only` que no funciona en CLI.
 *
 * Uso:
 *   TENANT_SLUG=gard npx tsx scripts/recompute-payroll.ts
 */

import { PrismaClient } from "@prisma/client";
import { startOfMonth } from "date-fns";

const prisma = new PrismaClient();

const WORKER_DEDUCTION_FALLBACK = 0.17;
const EMPLOYER_COST_FACTOR = 1.45;

async function computePayroll(tenantId: string, installationId: string) {
  const puestos = await prisma.opsPuestoOperativo.findMany({
    where: {
      tenantId,
      installationId,
      active: true,
      salaryStructureId: { not: null },
    },
    select: {
      requiredGuards: true,
      installation: { select: { name: true } },
      salaryStructure: { select: { baseSalary: true, netSalaryEstimate: true } },
    },
  });
  if (puestos.length === 0) return null;

  let liquidoTotal = 0;
  let employerTotal = 0;
  let name: string | null = null;
  for (const p of puestos) {
    if (!p.salaryStructure) continue;
    if (!name) name = p.installation?.name ?? null;
    const baseSalary = Number(p.salaryStructure.baseSalary ?? 0);
    if (baseSalary <= 0) continue;

    const count = Math.max(1, p.requiredGuards ?? 1);
    const netPerGuard = Number(p.salaryStructure.netSalaryEstimate ?? 0);
    const liquidoPerGuard =
      netPerGuard > 0
        ? netPerGuard
        : baseSalary * (1 - WORKER_DEDUCTION_FALLBACK);
    const employerCostPerGuard = baseSalary * EMPLOYER_COST_FACTOR;

    liquidoTotal += liquidoPerGuard * count;
    employerTotal += employerCostPerGuard * count;
  }
  if (employerTotal <= 0) return null;
  const liquido = Math.round(liquidoTotal);
  const previRed = Math.max(0, Math.round(employerTotal - liquido));
  return { liquido, previRed, name };
}

async function upsertVariant(args: {
  tenantId: string;
  installationId: string;
  source: "PAYROLL_LIQUIDO" | "PAYROLL_PREVIRED";
  categoryId: string;
  name: string;
  description: string;
  amount: number;
  dayOfMonth: number;
}) {
  const existing = await prisma.financeCashflowItem.findFirst({
    where: {
      tenantId: args.tenantId,
      source: args.source,
      sourceRefId: args.installationId,
    },
  });
  const data = {
    tenantId: args.tenantId,
    categoryId: args.categoryId,
    kind: "EXPENSE" as const,
    source: args.source,
    sourceRefId: args.installationId,
    name: args.name,
    description: args.description,
    amount: args.amount,
    currency: "CLP",
    recurrence: "MONTHLY" as const,
    dayOfMonth: args.dayOfMonth,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: startOfMonth(new Date()),
    endDate: null,
    installationId: args.installationId,
    isActive: true,
  };
  if (existing) {
    await prisma.financeCashflowItem.update({ where: { id: existing.id }, data });
    return existing.isActive ? "updated" : "reactivated";
  }
  await prisma.financeCashflowItem.create({ data });
  return "created";
}

async function syncTenant(tenantId: string, label: string) {
  const cats = await prisma.financeCashflowCategory.findMany({
    where: { tenantId, code: { in: ["EGR_SUELDO", "EGR_PREVIRED"] }, isActive: true },
    select: { id: true, code: true },
  });
  const sueldoCat = cats.find((c) => c.code === "EGR_SUELDO");
  const previRedCat = cats.find((c) => c.code === "EGR_PREVIRED") ?? sueldoCat;
  if (!sueldoCat || !previRedCat) {
    console.log(`  [${label}] sin categorías sueldos/previred — skip`);
    return;
  }

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { payrollPayDay: true, previRedPayDay: true },
  });
  const payDay = config?.payrollPayDay ?? 30;
  const dom = payDay === -1 ? -1 : Math.min(Math.max(payDay, 1), 28);
  const previRedDay = config?.previRedPayDay ?? 10;
  const previRedDom =
    previRedDay === -1 ? -1 : Math.min(Math.max(previRedDay, 1), 28);

  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId },
    select: { id: true },
  });
  // También incluir installationIds huérfanos (items existentes sin instalación viva)
  const orphans = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: { in: ["PAYROLL_LIQUIDO", "PAYROLL_PREVIRED"] } },
    select: { sourceRefId: true },
  });
  const targets = new Set<string>();
  for (const i of installations) targets.add(i.id);
  for (const o of orphans) if (o.sourceRefId) targets.add(o.sourceRefId);

  const stats = { created: 0, updated: 0, reactivated: 0, deactivated: 0 };

  for (const installationId of targets) {
    const computed = await computePayroll(tenantId, installationId);
    if (!computed) {
      const r = await prisma.financeCashflowItem.updateMany({
        where: {
          tenantId,
          source: { in: ["PAYROLL_LIQUIDO", "PAYROLL_PREVIRED"] },
          sourceRefId: installationId,
          isActive: true,
        },
        data: { isActive: false },
      });
      if (r.count > 0) stats.deactivated += r.count;
      continue;
    }
    const baseName = computed.name ?? "instalación";
    const a = await upsertVariant({
      tenantId,
      installationId,
      source: "PAYROLL_LIQUIDO",
      categoryId: sueldoCat.id,
      name: `Sueldos líquidos · ${baseName}`,
      description: "Líquido al guardia (transferencia mensual)",
      amount: computed.liquido,
      dayOfMonth: dom,
    });
    const b = await upsertVariant({
      tenantId,
      installationId,
      source: "PAYROLL_PREVIRED",
      categoryId: previRedCat.id,
      name: `PreviRed · ${baseName}`,
      description: "Imposiciones (AFP + Salud + AFC + SIS + mutual)",
      amount: computed.previRed,
      dayOfMonth: previRedDom,
    });
    for (const action of [a, b]) {
      if (action === "created") stats.created++;
      else if (action === "updated") stats.updated++;
      else if (action === "reactivated") stats.reactivated++;
    }
  }

  console.log(
    `  → created: ${stats.created}, updated: ${stats.updated}, reactivated: ${stats.reactivated}, deactivated: ${stats.deactivated}`,
  );
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true },
  });
  if (tenants.length === 0) {
    console.error(`❌ No se encontró tenant${slug ? ` con slug "${slug}"` : ""}`);
    process.exit(1);
  }
  console.log(`🚀 Recomputando payroll en ${tenants.length} tenant(s)…\n`);
  for (const t of tenants) {
    console.log(`📦 ${t.slug} (${t.name})`);
    await syncTenant(t.id, t.slug);
    console.log();
  }
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
