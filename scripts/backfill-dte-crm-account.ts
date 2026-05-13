/**
 * Auto-vincula DTEs históricos que tienen receiverRut pero crmAccountId=null
 * con la cuenta CRM correspondiente al mismo RUT. Idempotente.
 *
 * Normalización RUT: se quitan puntos, guiones y se baja a minúsculas el DV
 * (para que las variantes formateadas y sin formatear de un mismo RUT
 *  matcheen aunque el DV venga en mayúscula o minúscula).
 *
 * Cuando un tenant tiene >1 CrmAccount con el mismo RUT normalizado,
 * el DTE se reporta como "ambiguous" y NO se vincula.
 *
 * Uso:
 *   TENANT_SLUG=gard npx tsx scripts/backfill-dte-crm-account.ts
 *   (sin TENANT_SLUG: corre en todos los tenants activos)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

function normalizeRut(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[.\-\s]/g, "").toLowerCase();
  return cleaned.length === 0 ? null : cleaned;
}

interface TenantResult {
  matched: number;
  ambiguous: number;
  noMatch: number;
  total: number;
}

async function backfillTenant(tenantId: string, label: string): Promise<TenantResult> {
  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId, rut: { not: null } },
    select: { id: true, name: true, rut: true },
  });

  const byNormalizedRut = new Map<string, Array<{ id: string; name: string }>>();
  for (const a of accounts) {
    const k = normalizeRut(a.rut);
    if (!k) continue;
    const arr = byNormalizedRut.get(k) ?? [];
    arr.push({ id: a.id, name: a.name });
    byNormalizedRut.set(k, arr);
  }

  let matched = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let total = 0;
  let cursor: string | null = null;

  while (true) {
    const batch = await prisma.financeDte.findMany({
      where: {
        tenantId,
        crmAccountId: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: { id: true, folio: true, receiverRut: true },
    });
    if (batch.length === 0) break;
    total += batch.length;

    for (const d of batch) {
      const k = normalizeRut(d.receiverRut);
      if (!k) {
        noMatch++;
        continue;
      }
      const candidates = byNormalizedRut.get(k);
      if (!candidates || candidates.length === 0) {
        noMatch++;
        continue;
      }
      if (candidates.length > 1) {
        ambiguous++;
        console.log(
          `  ⚠ AMBIGUO F#${d.folio} ${d.receiverRut} matchea ${candidates.length} cuentas: ${candidates.map((c) => c.name).join(", ")}`,
        );
        continue;
      }
      await prisma.financeDte.update({
        where: { id: d.id },
        data: { crmAccountId: candidates[0].id },
      });
      matched++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  console.log(
    `  [${label}] matched=${matched} ambiguous=${ambiguous} no_match=${noMatch} total=${total}`,
  );
  return { matched, ambiguous, noMatch, total };
}

async function main() {
  const slug = process.env.TENANT_SLUG;
  const tenants = await prisma.tenant.findMany({
    where: { active: true, ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.error(`No se encontró ningún tenant${slug ? ` con slug "${slug}"` : ""}`);
    process.exit(1);
  }

  console.log(`Backfill DTE → CrmAccount en ${tenants.length} tenant(s)\n`);
  const totals: TenantResult = { matched: 0, ambiguous: 0, noMatch: 0, total: 0 };
  for (const t of tenants) {
    console.log(`Tenant ${t.slug} (${t.name})`);
    const r = await backfillTenant(t.id, t.slug);
    totals.matched += r.matched;
    totals.ambiguous += r.ambiguous;
    totals.noMatch += r.noMatch;
    totals.total += r.total;
  }
  console.log("─────────────────────────────────────");
  console.log(
    `Resumen global: matched=${totals.matched} ambiguous=${totals.ambiguous} no_match=${totals.noMatch} total=${totals.total}`,
  );
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
