/**
 * DIAGNÓSTICO (solo lectura) de datos huérfanos en CPQ.
 *
 * NO escribe ni corrige nada. Reporta por tenant:
 *   1. Cotizaciones (CpqQuote) cuyo `dealId` apunta a un CrmDeal inexistente.
 *   2. Cotizaciones cuyo `accountId` apunta a un CrmAccount inexistente.
 *   3. Propuestas (CpqProposalBundle) cuyo `dealId` no existe.
 *   4. Propuestas vacías (sin cotizaciones asociadas).
 *
 * Uso:
 *   npx tsx scripts/diagnose-cpq-orphans.ts               # todos los tenants
 *   npx tsx scripts/diagnose-cpq-orphans.ts --tenant <id> # un tenant
 *   npx tsx scripts/diagnose-cpq-orphans.ts --limit 50    # máx. filas por sección
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tenantArgIdx = process.argv.indexOf("--tenant");
const ONLY_TENANT = tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : null;
const limitArgIdx = process.argv.indexOf("--limit");
const ROW_LIMIT =
  limitArgIdx >= 0 ? Math.max(1, Number(process.argv[limitArgIdx + 1]) || 100) : 100;

function preview<T>(rows: T[], limit: number): { shown: T[]; extra: number } {
  return { shown: rows.slice(0, limit), extra: Math.max(0, rows.length - limit) };
}

async function diagnoseTenant(t: { id: string; name: string | null }): Promise<boolean> {
  // ── Cotizaciones con dealId / accountId ──
  const quotes = await prisma.cpqQuote.findMany({
    where: { tenantId: t.id },
    select: { id: true, code: true, status: true, dealId: true, accountId: true },
  });

  const dealIds = [...new Set(quotes.map((q) => q.dealId).filter(Boolean))] as string[];
  const accountIds = [...new Set(quotes.map((q) => q.accountId).filter(Boolean))] as string[];

  // Propuestas del tenant
  const bundles = await prisma.cpqProposalBundle.findMany({
    where: { tenantId: t.id },
    select: {
      id: true,
      code: true,
      name: true,
      dealId: true,
      _count: { select: { quotes: true } },
    },
  });
  const bundleDealIds = [...new Set(bundles.map((b) => b.dealId).filter(Boolean))] as string[];

  // Resolver existencia real de deals y accounts referenciados (scoped por tenant).
  const allDealIds = [...new Set([...dealIds, ...bundleDealIds])];
  const existingDeals = allDealIds.length
    ? await prisma.crmDeal.findMany({
        where: { id: { in: allDealIds }, tenantId: t.id },
        select: { id: true },
      })
    : [];
  const existingDealSet = new Set(existingDeals.map((d) => d.id));

  const existingAccounts = accountIds.length
    ? await prisma.crmAccount.findMany({
        where: { id: { in: accountIds }, tenantId: t.id },
        select: { id: true },
      })
    : [];
  const existingAccountSet = new Set(existingAccounts.map((a) => a.id));

  const quotesMissingDeal = quotes.filter(
    (q) => q.dealId && !existingDealSet.has(q.dealId),
  );
  const quotesMissingAccount = quotes.filter(
    (q) => q.accountId && !existingAccountSet.has(q.accountId),
  );
  const bundlesMissingDeal = bundles.filter(
    (b) => b.dealId && !existingDealSet.has(b.dealId),
  );
  const emptyBundles = bundles.filter((b) => b._count.quotes === 0);

  const hasFindings =
    quotesMissingDeal.length > 0 ||
    quotesMissingAccount.length > 0 ||
    bundlesMissingDeal.length > 0 ||
    emptyBundles.length > 0;

  if (!hasFindings) return false;

  console.log(`\n════════ Tenant "${t.name ?? "—"}" (${t.id}) ════════`);

  if (quotesMissingDeal.length > 0) {
    console.log(`\n  ⚠ Cotizaciones con dealId inexistente: ${quotesMissingDeal.length}`);
    const { shown, extra } = preview(quotesMissingDeal, ROW_LIMIT);
    for (const q of shown) {
      console.log(`    ${q.code} (${q.id}) status=${q.status} → dealId=${q.dealId}`);
    }
    if (extra > 0) console.log(`    … y ${extra} más`);
  }

  if (quotesMissingAccount.length > 0) {
    console.log(`\n  ⚠ Cotizaciones con accountId inexistente: ${quotesMissingAccount.length}`);
    const { shown, extra } = preview(quotesMissingAccount, ROW_LIMIT);
    for (const q of shown) {
      console.log(`    ${q.code} (${q.id}) status=${q.status} → accountId=${q.accountId}`);
    }
    if (extra > 0) console.log(`    … y ${extra} más`);
  }

  if (bundlesMissingDeal.length > 0) {
    console.log(`\n  ⚠ Propuestas con dealId inexistente (huérfanas): ${bundlesMissingDeal.length}`);
    const { shown, extra } = preview(bundlesMissingDeal, ROW_LIMIT);
    for (const b of shown) {
      console.log(`    ${b.code}${b.name ? ` (${b.name})` : ""} (${b.id}) → dealId=${b.dealId} · ${b._count.quotes} cotización(es)`);
    }
    if (extra > 0) console.log(`    … y ${extra} más`);
  }

  if (emptyBundles.length > 0) {
    console.log(`\n  ⚠ Propuestas vacías (sin cotizaciones): ${emptyBundles.length}`);
    const { shown, extra } = preview(emptyBundles, ROW_LIMIT);
    for (const b of shown) {
      console.log(`    ${b.code}${b.name ? ` (${b.name})` : ""} (${b.id})`);
    }
    if (extra > 0) console.log(`    … y ${extra} más`);
  }

  return true;
}

async function main() {
  const tenants = ONLY_TENANT
    ? await prisma.tenant.findMany({ where: { id: ONLY_TENANT }, select: { id: true, name: true } })
    : await prisma.tenant.findMany({ select: { id: true, name: true } });

  console.log(
    `Diagnóstico de huérfanos CPQ · ${tenants.length} tenant(s) · SOLO LECTURA (no corrige nada)`,
  );

  let tenantsWithFindings = 0;
  for (const t of tenants) {
    const found = await diagnoseTenant(t);
    if (found) tenantsWithFindings += 1;
  }

  if (tenantsWithFindings === 0) {
    console.log(`\n✓ Sin huérfanos detectados en ${tenants.length} tenant(s).`);
  } else {
    console.log(`\nTenants con hallazgos: ${tenantsWithFindings} de ${tenants.length}.`);
  }
  console.log(`\nFin del diagnóstico (no se escribió nada).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
