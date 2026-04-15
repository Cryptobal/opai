/**
 * Migra `proposalLink` de negocios que todavía apuntan a la presentación interna
 * (`/p/<uniqueId>?mode=commercial`) hacia el Portal del Cliente.
 *
 * Antes, el `proposalLink` del deal se guardaba como la URL pública de la
 * Presentación (`/p/...`). Hoy el cliente debe acceder siempre por el Portal
 * del Cliente, por lo que los correos de seguimiento (que inyectan
 * `{deal.proposalLink}`) deben apuntar a `/portal/cliente?email=...&t=<slug>`.
 *
 * Este script recorre todos los deals abiertos con `proposalLink` apuntando a
 * `/p/` y los reemplaza por la URL del portal usando el email del contacto
 * principal del deal.
 *
 * Uso:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-proposal-links-to-portal.ts
 *
 * Para un tenant puntual:
 *   TENANT_SLUG=gard npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-proposal-links-to-portal.ts
 *
 * Para solo simular (no escribe en DB):
 *   DRY_RUN=1 npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/backfill-proposal-links-to-portal.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function portalClienteBasePath(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ""}/portal/cliente`;
}

function buildPortalUrl(email: string | null | undefined, tenantSlug: string | null): string {
  const qs = new URLSearchParams();
  if (email && email.trim()) qs.set('email', email.trim());
  if (tenantSlug) qs.set('t', tenantSlug);
  const base = portalClienteBasePath();
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

function isLegacyPresentationLink(link: string | null | undefined): boolean {
  if (!link) return false;
  // Coincide con `${siteUrl}/p/<id>` o `${siteUrl}/p/<id>?...`
  return /\/p\/[A-Za-z0-9_-]+(\?|$)/.test(link);
}

async function main() {
  const tenantSlugFilter = process.env.TENANT_SLUG?.trim() || null;
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  const tenants = await prisma.tenant.findMany({
    where: tenantSlugFilter
      ? { slug: tenantSlugFilter, active: true }
      : { active: true },
    select: { id: true, slug: true, name: true },
  });

  if (tenants.length === 0) {
    console.error('❌ No se encontraron tenants activos' + (tenantSlugFilter ? ` con slug "${tenantSlugFilter}"` : ''));
    process.exit(1);
  }

  console.log(dryRun ? '🔎 Modo DRY RUN (no escribe cambios)' : '✏️  Modo escritura');
  console.log(`🏢 Tenants a revisar: ${tenants.length}`);

  let totalUpdated = 0;
  let totalSkippedAlreadyPortal = 0;
  let totalSkippedNoEmail = 0;
  let totalScanned = 0;

  for (const tenant of tenants) {
    const deals = await prisma.crmDeal.findMany({
      where: {
        tenantId: tenant.id,
        proposalLink: { not: null },
      },
      include: {
        primaryContact: { select: { email: true } },
      },
    });

    if (deals.length === 0) continue;

    console.log(`\n→ ${tenant.name} (${tenant.slug}): ${deals.length} deals con proposalLink`);

    let updated = 0;
    let skippedAlreadyPortal = 0;
    let skippedNoEmail = 0;

    for (const deal of deals) {
      totalScanned++;

      if (!isLegacyPresentationLink(deal.proposalLink)) {
        skippedAlreadyPortal++;
        continue;
      }

      const email = deal.primaryContact?.email ?? null;
      if (!email) {
        skippedNoEmail++;
        continue;
      }

      const newLink = buildPortalUrl(email, tenant.slug);

      if (dryRun) {
        console.log(`  [dry] ${deal.title.slice(0, 40)}…  →  ${newLink}`);
      } else {
        await prisma.crmDeal.update({
          where: { id: deal.id },
          data: { proposalLink: newLink },
        });
        console.log(`  ✓ ${deal.title.slice(0, 40)}…  →  ${newLink}`);
      }
      updated++;
    }

    console.log(`   Actualizados: ${updated} · Ya apuntan al portal (o no /p/): ${skippedAlreadyPortal} · Sin email de contacto: ${skippedNoEmail}`);

    totalUpdated += updated;
    totalSkippedAlreadyPortal += skippedAlreadyPortal;
    totalSkippedNoEmail += skippedNoEmail;
  }

  console.log('\n📊 Resumen total');
  console.log('   Deals revisados:', totalScanned);
  console.log('   Actualizados:', totalUpdated);
  console.log('   Ya apuntaban al portal (o no /p/):', totalSkippedAlreadyPortal);
  console.log('   Sin email del contacto principal:', totalSkippedNoEmail);
  console.log(dryRun ? '\nℹ️  DRY RUN: ningún cambio fue escrito.' : '\n🎉 Listo.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
