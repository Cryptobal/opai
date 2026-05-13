/**
 * One-shot idempotente: borra plantillas FinanceDteRecurringTemplate que
 * duplicaban ingresos ya cubiertos por items source=CONTRACT del flujo
 * de caja.
 *
 * Contexto (2026-05-12):
 *   El cashflow tenía duplicación CONTRACT ↔ RECURRING_DTE para 3
 *   cuentas — Condominio La Florida, Embajada Brasil, Polpaico —
 *   inflando los ingresos del horizonte. Decisión del usuario: el
 *   contrato es la fuente de verdad, las plantillas DTE recurrentes de
 *   esos clientes se eliminan. Si en el futuro algún cliente requiere
 *   facturación recurrente, se crea la plantilla DE NUEVO a propósito.
 *
 * Qué borra:
 *   1. FinanceCashflowItem source=RECURRING_DTE cuyo crmAccountId está
 *      en la lista objetivo. Cascade: occurrences PROJECTED.
 *   2. FinanceDteRecurringTemplate correspondiente (sourceRefId del
 *      item). Cascade: attachments + runs. Los DTEs ya emitidos
 *      (FinanceDte) NO se tocan — el run queda con dteId=null por
 *      onDelete: SetNull.
 *
 * Seguridad:
 *   - Solo opera sobre los crmAccountId hardcodeados abajo. Cambiarlos
 *     requiere editar el archivo. No acepta input externo.
 *   - Aborta si encuentra ocurrencias del item con bank_transaction_id
 *     != null (ya conciliadas).
 *   - DRY_RUN=1 imprime el plan sin tocar nada.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/delete-recurring-dte-duplicates.ts
 *   npx tsx scripts/delete-recurring-dte-duplicates.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "1";

// crmAccountId completos. Tomados de la auditoría manual de 2026-05-12.
// No hardcodear nombres porque pueden cambiar; usar UUIDs es estable.
const TARGET_ACCOUNT_PREFIXES = [
  "1004da40", // Condominio La Florida
  "21f91946", // Embajada Brasil
  "61ff53d6", // Polpaico (varias instalaciones)
];

async function resolveAccountIds(tenantId: string): Promise<string[]> {
  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const matches: { id: string; name: string }[] = [];
  for (const prefix of TARGET_ACCOUNT_PREFIXES) {
    const found = accounts.filter((a) => a.id.startsWith(prefix));
    if (found.length !== 1) {
      throw new Error(
        `Prefix ${prefix} matchea ${found.length} cuentas — esperaba 1. Aborto por seguridad.`,
      );
    }
    matches.push(found[0]);
  }
  console.log("Cuentas objetivo:");
  for (const m of matches) console.log(`  · ${m.name} (${m.id})`);
  console.log();
  return matches.map((m) => m.id);
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: "gard" },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error("❌ Tenant gard no encontrado");
    process.exit(1);
  }

  console.log(
    `🧹 Eliminando plantillas DTE recurrentes duplicadas${DRY_RUN ? " (DRY RUN)" : ""}`,
  );
  console.log(`📦 Tenant: ${tenant.slug} (${tenant.name})\n`);

  const accountIds = await resolveAccountIds(tenant.id);

  const items = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId: tenant.id,
      source: "RECURRING_DTE",
      crmAccountId: { in: accountIds },
    },
    select: {
      id: true,
      name: true,
      amount: true,
      currency: true,
      sourceRefId: true,
      crmAccountId: true,
      occurrences: {
        select: { id: true, status: true, bankTransactionId: true },
      },
    },
  });

  if (items.length === 0) {
    console.log("✅ No quedan items RECURRING_DTE en las cuentas objetivo. Nada que hacer.");
    return;
  }

  console.log(`Items source=RECURRING_DTE a eliminar (${items.length}):`);
  const templateIds = new Set<string>();
  let abort = false;
  for (const it of items) {
    const reconciled = it.occurrences.filter((o) => o.bankTransactionId);
    const flag = reconciled.length > 0 ? `  ⚠️  ${reconciled.length} CONCILIADAS` : "";
    console.log(
      `  · "${it.name}" (id=${it.id.slice(0, 8)}) ${it.currency} ${Number(it.amount)} — occ=${it.occurrences.length}${flag}`,
    );
    if (reconciled.length > 0) abort = true;
    if (it.sourceRefId) templateIds.add(it.sourceRefId);
  }
  if (abort) {
    console.error(
      "\n❌ Hay ocurrencias conciliadas con banco. Abortando para no perder los vínculos. Revisar manualmente.",
    );
    process.exit(1);
  }

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: { tenantId: tenant.id, id: { in: Array.from(templateIds) } },
    select: {
      id: true,
      name: true,
      receiverName: true,
      currency: true,
      isActive: true,
      runCount: true,
      _count: { select: { generatedDtes: true, attachments: true } },
    },
  });

  console.log(`\nPlantillas FinanceDteRecurringTemplate a eliminar (${templates.length}):`);
  for (const t of templates) {
    console.log(
      `  · "${t.name}" (id=${t.id.slice(0, 8)}) | receptor=${t.receiverName} | currency=${t.currency} | active=${t.isActive} | runs=${t._count.generatedDtes} | attachments=${t._count.attachments}`,
    );
  }

  const orphanIds = Array.from(templateIds).filter(
    (id) => !templates.find((t) => t.id === id),
  );
  if (orphanIds.length > 0) {
    console.log(
      `\n⚠️  ${orphanIds.length} item(s) RECURRING_DTE apuntan a plantillas inexistentes (huérfanos). Los items se borran igual.`,
    );
  }

  console.log(
    `\nResumen: ${items.length} items + ${templates.length} plantillas. ` +
      `Los runs históricos caen en cascade (los DTEs emitidos quedan con dteId=NULL en el run, pero los DTEs se preservan).`,
  );

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No se borró nada.");
    return;
  }

  // Borrado en transacción: items primero (cascade occurrences),
  // plantillas después (cascade attachments + runs).
  await prisma.$transaction(async (tx) => {
    const delItems = await tx.financeCashflowItem.deleteMany({
      where: { id: { in: items.map((i) => i.id) } },
    });
    const delTpls = await tx.financeDteRecurringTemplate.deleteMany({
      where: { id: { in: templates.map((t) => t.id) } },
    });
    console.log(
      `\n✅ Borrados: ${delItems.count} cashflow items + ${delTpls.count} plantillas DTE.`,
    );
  });
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
