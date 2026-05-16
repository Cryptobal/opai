/**
 * ⚠️ DEPRECADO desde 2026-05-16 — esta lógica ahora vive en la migración
 * Prisma `seed_cashflow_adjustment_categories` que corre automáticamente
 * en cada deploy. Este script se mantiene solo por compatibilidad
 * histórica y NO debe correrse manualmente — la migración hace lo mismo
 * de forma idempotente (y además marca isTaxExempt=true).
 *
 * Si necesitas resembrar categorías para un tenant, corré la migración
 * o ejecutá los INSERTs del SQL directamente.
 *
 * Idempotente: crea las dos categorías sistema de ajuste de conciliación
 * para TODOS los tenants que tengan FinanceCashflowConfig. Si ya existen,
 * no hace nada.
 *
 * Ejecutar (NO recomendado): npx tsx scripts/seed-cashflow-ajuste-categories.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = [
  {
    code: "ING_AJUSTE_CONCILIACION",
    name: "Ajuste de conciliación (ingreso)",
    kind: "INCOME" as const,
    sortOrder: 990,
  },
  {
    code: "EGR_AJUSTE_CONCILIACION",
    name: "Ajuste de conciliación (egreso)",
    kind: "EXPENSE" as const,
    sortOrder: 995,
  },
];

async function main() {
  const configs = await prisma.financeCashflowConfig.findMany({
    select: { tenantId: true },
  });
  console.log(`[seed] Procesando ${configs.length} tenants...`);

  let created = 0;
  for (const { tenantId } of configs) {
    for (const cat of CATEGORIES) {
      const existing = await prisma.financeCashflowCategory.findFirst({
        where: { tenantId, code: cat.code },
      });
      if (existing) continue;
      await prisma.financeCashflowCategory.create({
        data: {
          tenantId,
          code: cat.code,
          name: cat.name,
          kind: cat.kind,
          sortOrder: cat.sortOrder,
          isSystem: true,
          isActive: true,
        },
      });
      created++;
    }
  }
  console.log(`[seed] OK. ${created} categorías creadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
