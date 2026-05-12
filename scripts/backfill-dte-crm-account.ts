/**
 * Auto-vincula DTEs históricos que tienen receiverRut pero crmAccountId=null
 * con la cuenta CRM correspondiente al mismo RUT. Idempotente.
 *
 * Uso:
 *   TENANT_SLUG=gard npx tsx scripts/backfill-dte-crm-account.ts
 *   (sin TENANT_SLUG: corre en todos los tenants activos)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfillTenant(tenantId: string, label: string) {
  const dtes = await prisma.financeDte.findMany({
    where: { tenantId, crmAccountId: null },
    select: { id: true, folio: true, receiverRut: true, receiverName: true },
  });
  if (dtes.length === 0) {
    console.log(`  [${label}] nada que vincular`);
    return { linked: 0 };
  }

  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId },
    select: { id: true, name: true, rut: true },
  });
  const byRut = new Map<string, { id: string; name: string }>();
  for (const a of accounts) {
    if (a.rut) byRut.set(a.rut, { id: a.id, name: a.name });
  }

  let linked = 0;
  for (const d of dtes) {
    if (!d.receiverRut) continue;
    const match = byRut.get(d.receiverRut);
    if (!match) continue;
    await prisma.financeDte.update({
      where: { id: d.id },
      data: { crmAccountId: match.id },
    });
    console.log(`  · F#${d.folio} ${d.receiverRut} → ${match.name}`);
    linked++;
  }
  return { linked };
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

  console.log(`🚀 Backfilling DTE → CrmAccount en ${tenants.length} tenant(s)…\n`);
  let total = 0;
  for (const t of tenants) {
    console.log(`📦 ${t.slug} (${t.name})`);
    const r = await backfillTenant(t.id, t.slug);
    total += r.linked;
    console.log(`  → ${r.linked} vinculados\n`);
  }
  console.log("─────────────────────────────────────");
  console.log(`✅ Total: ${total} DTEs vinculados`);
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
