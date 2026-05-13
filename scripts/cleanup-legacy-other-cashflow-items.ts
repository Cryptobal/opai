/**
 * One-shot idempotente: borra los FinanceCashflowItem con `source=OTHER`
 * que quedaron como huérfanos legacy tras la migración CONTRACT → OTHER
 * de 2026-05-11 (ver `scripts/migrate-contract-items-to-manual.ts`).
 *
 * Contexto: los contratos del CRM ahora se materializan como
 * `source=CONTRACT` desde el tab "Contratos" de cada cuenta. La etiqueta
 * `OTHER` quedó como sedimento del modelo viejo. Cualquier item legítimo
 * que el usuario quiera volver a llevar a flujo de caja, lo agrega desde
 * `/crm/accounts/[id]/contracts` y crea una fila CONTRACT nueva.
 *
 * Seguridad: solo borra items sin occurrences conciliadas (sin
 * `bank_transaction_id`). Si encuentra alguna, aborta con error.
 *
 * Uso:
 *   TENANT_SLUG=gard npx tsx scripts/cleanup-legacy-other-cashflow-items.ts
 *   (sin TENANT_SLUG corre en todos los tenants activos)
 *
 *   DRY_RUN=1 npx tsx scripts/cleanup-legacy-other-cashflow-items.ts
 *   (lista sin borrar)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";

async function cleanupTenant(tenantId: string, label: string) {
  const items = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "OTHER" },
    select: {
      id: true,
      name: true,
      amount: true,
      currency: true,
      sourceRefId: true,
      occurrences: {
        select: { id: true, status: true, bankTransactionId: true },
      },
    },
  });

  if (items.length === 0) {
    console.log(`  [${label}] sin items OTHER que limpiar`);
    return { deleted: 0, skipped: 0 };
  }

  let deleted = 0;
  let skipped = 0;

  for (const item of items) {
    const reconciled = item.occurrences.filter((o) => o.bankTransactionId);
    if (reconciled.length > 0) {
      console.log(
        `  ⚠️  SKIP "${item.name}" (id=${item.id.slice(0, 8)}): ${reconciled.length} ocurrencias conciliadas. Borrarlo perdería el vínculo bancario.`,
      );
      skipped++;
      continue;
    }
    console.log(
      `  · ${DRY_RUN ? "[DRY]" : "borra"} "${item.name}" (${item.currency} ${Number(item.amount)}) — ${item.occurrences.length} ocurrencias en cascade`,
    );
    if (!DRY_RUN) {
      await prisma.financeCashflowItem.delete({ where: { id: item.id } });
      deleted++;
    }
  }

  return { deleted, skipped };
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.error(`❌ No se encontró tenant${slug ? ` con slug "${slug}"` : " activo"}`);
    process.exit(1);
  }

  console.log(
    `🧹 Limpieza de items OTHER legacy${DRY_RUN ? " (DRY RUN)" : ""} — ${tenants.length} tenant(s)\n`,
  );

  let totalDeleted = 0;
  let totalSkipped = 0;

  for (const t of tenants) {
    console.log(`📦 ${t.slug} (${t.name})`);
    const r = await cleanupTenant(t.id, t.slug);
    totalDeleted += r.deleted;
    totalSkipped += r.skipped;
    console.log(
      `  → ${r.deleted} borrados, ${r.skipped} saltados${DRY_RUN ? " [dry]" : ""}\n`,
    );
  }

  console.log("─────────────────────────────────────");
  console.log(`✅ Total borrados: ${totalDeleted}`);
  if (totalSkipped > 0) {
    console.log(
      `⚠️  Saltados: ${totalSkipped} (tenían occurrences conciliadas; revisar manualmente)`,
    );
  }
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
