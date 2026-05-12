/**
 * One-shot: borra definitivamente los FinanceCashflowItem con source=PAYROLL
 * (variante monolítica pre-split). Después del split de 2026-05-11, los sueldos
 * se generan como dos items separados: PAYROLL_LIQUIDO y PAYROLL_PREVIRED.
 *
 * Cascade: FinanceCashflowOccurrence + FinanceCashflowIpcAdjustment caen por
 * onDelete: Cascade en el schema.
 *
 * Uso:
 *   TENANT_SLUG=gard npx tsx scripts/delete-legacy-payroll-items.ts
 *   (sin TENANT_SLUG: corre en todos los tenants activos)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function deleteTenant(tenantId: string, label: string) {
  const items = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "PAYROLL" },
    select: {
      id: true,
      name: true,
      amount: true,
      isActive: true,
    },
  });

  if (items.length === 0) {
    console.log(`  [${label}] nada que borrar`);
    return { deleted: 0 };
  }

  for (const item of items) {
    const flag = item.isActive ? "" : " (inactivo)";
    console.log(`  · ${item.name} ($${Number(item.amount).toLocaleString("es-CL")})${flag}`);
  }

  const result = await prisma.financeCashflowItem.deleteMany({
    where: { tenantId, source: "PAYROLL" },
  });

  return { deleted: result.count };
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.error(`❌ No se encontró ningún tenant${slug ? ` con slug "${slug}"` : ""}`);
    process.exit(1);
  }

  console.log(`🚀 Borrando legacy payroll items en ${tenants.length} tenant(s)…\n`);

  let total = 0;
  for (const t of tenants) {
    console.log(`📦 ${t.slug} (${t.name})`);
    const r = await deleteTenant(t.id, t.slug);
    total += r.deleted;
    console.log(`  → ${r.deleted} borrados\n`);
  }

  console.log("─────────────────────────────────────");
  console.log(`✅ Total borrados: ${total}`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
