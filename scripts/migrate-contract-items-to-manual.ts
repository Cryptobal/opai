/**
 * One-shot: migra FinanceCashflowItem source=CONTRACT → OTHER en todos los
 * tenants. Reescribe sourceRefId apuntando al Document.id cuando hay un
 * contrato (DocAssociation) asociado al deal del quote.
 *
 * Idempotente: si no quedan items CONTRACT, retorna 0.
 *
 * Uso:
 *   TENANT_SLUG=gard npx tsx scripts/migrate-contract-items-to-manual.ts
 *   (o sin TENANT_SLUG para correrlo en todos los tenants)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateTenant(tenantId: string, label: string) {
  const items = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "CONTRACT" },
    select: { id: true, name: true, amount: true, currency: true, sourceRefId: true },
  });

  if (items.length === 0) {
    console.log(`  [${label}] nada que migrar`);
    return { migrated: 0, withDocument: 0, orphan: 0 };
  }

  let withDocument = 0;
  let orphan = 0;

  for (const item of items) {
    let newRefId: string | null = item.sourceRefId;
    let resolution = "huérfano";

    if (item.sourceRefId) {
      const quote = await prisma.cpqQuote.findFirst({
        where: { id: item.sourceRefId, tenantId },
        select: { dealId: true, code: true },
      });
      if (quote?.dealId) {
        const assoc = await prisma.docAssociation.findFirst({
          where: {
            entityType: "crm_deal",
            entityId: quote.dealId,
            document: { tenantId, module: "crm" },
          },
          select: { documentId: true },
        });
        if (assoc) {
          newRefId = assoc.documentId;
          resolution = `→ doc ${assoc.documentId.slice(0, 8)} (quote ${quote.code})`;
          withDocument++;
        } else {
          resolution = `huérfano (quote ${quote.code} sin contrato PDF)`;
          orphan++;
        }
      } else {
        orphan++;
      }
    } else {
      orphan++;
    }

    console.log(
      `  · ${item.name} (${Number(item.amount)} ${item.currency}) ${resolution}`,
    );

    await prisma.financeCashflowItem.update({
      where: { id: item.id },
      data: { source: "OTHER", sourceRefId: newRefId },
    });
  }

  return { migrated: items.length, withDocument, orphan };
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

  console.log(`🚀 Migrando contract items en ${tenants.length} tenant(s)…\n`);

  let totalMigrated = 0;
  let totalWithDoc = 0;
  let totalOrphan = 0;

  for (const t of tenants) {
    console.log(`📦 ${t.slug} (${t.name})`);
    const r = await migrateTenant(t.id, t.slug);
    totalMigrated += r.migrated;
    totalWithDoc += r.withDocument;
    totalOrphan += r.orphan;
    console.log(
      `  → ${r.migrated} migrados (${r.withDocument} con documento, ${r.orphan} huérfanos)\n`,
    );
  }

  console.log("─────────────────────────────────────");
  console.log(`✅ Total: ${totalMigrated} items`);
  console.log(`   con documento: ${totalWithDoc}`);
  console.log(`   huérfanos: ${totalOrphan}`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
