#!/usr/bin/env tsx
/**
 * Cleanup de tickets de supervisión duplicados.
 *
 * Uso:
 *   npx tsx scripts/cleanup-duplicate-supervision-tickets.ts --tenant-slug=gard              # dry run
 *   npx tsx scripts/cleanup-duplicate-supervision-tickets.ts --tenant-slug=gard --apply      # real
 *   npx tsx scripts/cleanup-duplicate-supervision-tickets.ts --tenant-slug=gard --limit=5    # primeros 5 grupos
 *
 * Acción (irreversible en --apply):
 *   - Agrupa tickets activos (hallazgo_supervision*) por (installationId, ticketTypeId, dedupKey).
 *   - Para grupos con >1 ticket: mantiene el más antiguo, consolida occurrenceCount de los
 *     findings duplicados en el canónico, reasigna sus findings al canónico con status=superseded,
 *     y elimina los tickets duplicados (DELETE real; approvals y comments caen en cascada).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACTIVE_TICKET_STATUSES = ["open", "in_progress", "waiting", "pending_approval"] as const;
const HALLAZGO_SLUGS = ["hallazgo_supervision", "hallazgo_supervision_critico"] as const;

function parseArgs() {
  const apply = process.argv.includes("--apply");
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant-slug="));
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  if (!tenantArg) {
    console.error("❌ Falta --tenant-slug=<slug>");
    process.exit(1);
  }
  const tenantSlug = tenantArg.split("=")[1];
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  return { apply, tenantSlug, limit };
}

async function main() {
  const { apply, tenantSlug, limit } = parseArgs();

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant no encontrado: ${tenantSlug}`);

  console.log(`\n🔎 Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`🔧 Modo: ${apply ? "APPLY (⚠️  DELETE real)" : "dry-run"}`);
  if (limit) console.log(`📏 Limit: ${limit} grupos`);

  const ticketTypes = await prisma.opsTicketType.findMany({
    where: { tenantId: tenant.id, slug: { in: [...HALLAZGO_SLUGS] } },
    select: { id: true, slug: true },
  });
  const ticketTypeIds = ticketTypes.map((t) => t.id);
  if (ticketTypeIds.length === 0) {
    console.log("⚠️  No hay ticket types hallazgo_* para este tenant. Fin.");
    return;
  }

  const tickets = await prisma.opsTicket.findMany({
    where: {
      tenantId: tenant.id,
      ticketTypeId: { in: ticketTypeIds },
      status: { in: [...ACTIVE_TICKET_STATUSES] },
    },
    select: {
      id: true,
      code: true,
      createdAt: true,
      installationId: true,
      ticketTypeId: true,
      supervisionFindings: {
        select: { id: true, dedupKey: true, occurrenceCount: true },
        orderBy: { firstDetectedAt: "asc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📋 Tickets activos candidatos: ${tickets.length}`);

  type TicketRow = (typeof tickets)[number];
  const groups = new Map<string, TicketRow[]>();
  for (const t of tickets) {
    const finding = t.supervisionFindings[0];
    if (!finding?.dedupKey || !t.installationId) continue;
    const key = `${t.installationId}|${t.ticketTypeId}|${finding.dedupKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const duplicatedGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`🧮 Grupos con duplicados: ${duplicatedGroups.length}`);

  const toProcess = limit ? duplicatedGroups.slice(0, limit) : duplicatedGroups;

  let totalDeleted = 0;
  let totalReassigned = 0;
  let totalOccurrencesMerged = 0;

  for (const [key, group] of toProcess) {
    const [canonical, ...dupes] = group;
    const canonicalFinding = canonical.supervisionFindings[0]!;

    const dupeIds = dupes.map((d) => d.id);
    const dupeFindingIds = dupes.flatMap((d) => d.supervisionFindings.map((f) => f.id));
    const occurrencesToMerge = dupes.reduce(
      (sum, d) => sum + (d.supervisionFindings[0]?.occurrenceCount ?? 1),
      0,
    );

    console.log(
      `\n  [${key.slice(0, 60)}...] canonical=${canonical.code} dupes=[${dupes
        .map((d) => d.code)
        .join(", ")}] +${occurrencesToMerge}occ`,
    );

    if (!apply) {
      totalDeleted += dupes.length;
      totalReassigned += dupeFindingIds.length;
      totalOccurrencesMerged += occurrencesToMerge;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (dupeFindingIds.length > 0) {
          await tx.opsSupervisionFinding.updateMany({
            where: { id: { in: dupeFindingIds }, tenantId: tenant.id },
            data: {
              ticketId: canonical.id,
              status: "superseded",
              updatedAt: new Date(),
            },
          });
        }

        await tx.opsSupervisionFinding.update({
          where: { id: canonicalFinding.id },
          data: {
            occurrenceCount: { increment: occurrencesToMerge },
            lastDetectedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        await tx.opsTicket.deleteMany({
          where: { id: { in: dupeIds }, tenantId: tenant.id },
        });
      });

      totalDeleted += dupes.length;
      totalReassigned += dupeFindingIds.length;
      totalOccurrencesMerged += occurrencesToMerge;
    } catch (err) {
      console.error(`    ❌ Error en grupo ${key.slice(0, 40)}:`, err);
    }
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`Grupos procesados: ${toProcess.length}`);
  console.log(`Tickets ${apply ? "ELIMINADOS" : "a eliminar"}: ${totalDeleted}`);
  console.log(`Findings reasignados: ${totalReassigned}`);
  console.log(`Ocurrencias consolidadas: ${totalOccurrencesMerged}`);
  if (!apply) console.log(`\nℹ️  Dry run. Para ejecutar agregá --apply`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
