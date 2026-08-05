/**
 * Limpia huérfanos de agenda dejados por borrados de negocio sin cascada.
 *
 * Por defecto es --dry-run. --tenant es obligatorio.
 * Con --apply cancela en Google (si aplica) y elimina restos locales.
 *
 * Uso:
 *   npx tsx prisma/scripts/cleanup-orphan-agenda-events.ts --tenant clgard00000000000000001
 *   npx tsx prisma/scripts/cleanup-orphan-agenda-events.ts --tenant <id> --apply
 *
 * NO ejecutar --apply sin autorización explícita de Carlos.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MILESTONE_LABELS = [
  "Consultas",
  "Visita técnica",
  "Entrega de bases",
  "Entrega de oferta",
] as const;

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

const apply = process.argv.includes("--apply");
const tenantId = argValue("--tenant");

async function main() {
  if (!tenantId) {
    console.error("Uso: --tenant <tenantId> [--apply]");
    process.exit(1);
  }

  console.log(
    `[cleanup-orphan-agenda] tenant=${tenantId} modo=${apply ? "APPLY" : "DRY-RUN"}`,
  );

  const orphanVisitas = await prisma.agendaVisita.findMany({
    where: {
      tenantId,
      dealId: null,
      OR: [
        { label: { in: [...MILESTONE_LABELS] } },
        { notes: { startsWith: "Hito:" } },
      ],
    },
    select: {
      id: true,
      title: true,
      label: true,
      status: true,
      startAt: true,
      notes: true,
    },
    orderBy: { startAt: "desc" },
  });

  const orphanLicitacionLinks = await prisma.agendaEventLink.findMany({
    where: { tenantId, sourceType: "licitacion" },
    select: {
      id: true,
      sourceId: true,
      syncStatus: true,
      googleEventId: true,
      lastError: true,
    },
  });

  const dealIds = [
    ...new Set(orphanLicitacionLinks.map((l) => l.sourceId).filter(Boolean)),
  ];
  const existingDeals =
    dealIds.length > 0
      ? await prisma.crmDeal.findMany({
          where: { tenantId, id: { in: dealIds } },
          select: { id: true },
        })
      : [];
  const existingDealSet = new Set(existingDeals.map((d) => d.id));
  const brokenLicitacion = orphanLicitacionLinks.filter(
    (l) => !existingDealSet.has(l.sourceId),
  );

  // CalendarProviderLink SYNCED cuyo CalendarEvent apunta a deal inexistente
  // o es hito huérfano (misma id que AgendaVisita huérfana).
  const orphanVisitaIds = new Set(orphanVisitas.map((v) => v.id));
  const syncedLinks = await prisma.calendarProviderLink.findMany({
    where: {
      tenantId,
      syncStatus: "SYNCED",
      providerEventId: { not: null },
    },
    select: {
      id: true,
      eventId: true,
      providerEventId: true,
      event: {
        select: {
          id: true,
          title: true,
          dealId: true,
          description: true,
        },
      },
    },
  });

  const dealIdsFromLinks = [
    ...new Set(
      syncedLinks
        .map((l) => l.event.dealId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const dealsForLinks =
    dealIdsFromLinks.length > 0
      ? await prisma.crmDeal.findMany({
          where: { tenantId, id: { in: dealIdsFromLinks } },
          select: { id: true },
        })
      : [];
  const liveDealSet = new Set(dealsForLinks.map((d) => d.id));

  const brokenProviderLinks = syncedLinks.filter((l) => {
    if (orphanVisitaIds.has(l.eventId)) return true;
    if (l.event.dealId && !liveDealSet.has(l.event.dealId)) return true;
    return false;
  });

  console.log(
    JSON.stringify(
      {
        counts: {
          orphanAgendaVisitas: orphanVisitas.length,
          orphanLicitacionLinks: brokenLicitacion.length,
          syncedProviderLinksOrphanContext: brokenProviderLinks.length,
        },
        orphanAgendaVisitas: orphanVisitas.map((v) => ({
          id: v.id,
          title: v.title,
          label: v.label,
          status: v.status,
          startAt: v.startAt.toISOString(),
          notesPrefix: v.notes?.slice(0, 40) ?? null,
          googleNote:
            "Si el evento ya se borró a mano en Google, --apply solo limpia local.",
        })),
        orphanLicitacionLinks: brokenLicitacion.map((l) => ({
          id: l.id,
          sourceId: l.sourceId,
          syncStatus: l.syncStatus,
          hasGoogleEventId: Boolean(l.googleEventId),
          googleEventId: l.googleEventId,
        })),
        brokenProviderLinks: brokenProviderLinks.map((l) => ({
          id: l.id,
          eventId: l.eventId,
          title: l.event.title,
          dealId: l.event.dealId,
          providerEventId: l.providerEventId,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(
      "[cleanup-orphan-agenda] DRY-RUN: no se modificó nada. Pasa --apply para limpiar.",
    );
    return;
  }

  let deletedVisitas = 0;
  let cancelledProviderLinks = 0;
  let deletedLicitacionLinks = 0;

  for (const v of orphanVisitas) {
    // Marcar espejo cancelado; no llamamos Google aquí sin auth de usuario.
    // El brief indica que los eventos en Google ya fueron borrados a mano.
    await prisma.calendarEvent.updateMany({
      where: { id: v.id, tenantId },
      data: { status: "cancelled", deletedAt: new Date(), dealId: null },
    });
    await prisma.calendarProviderLink.updateMany({
      where: { tenantId, eventId: v.id, syncStatus: { not: "CANCELLED" } },
      data: {
        syncStatus: "CANCELLED",
        lastError: "cleanup-orphan-agenda-events",
        lastSyncAt: new Date(),
      },
    });
    await prisma.agendaEventLink.deleteMany({
      where: { tenantId, sourceType: "agenda_visita", sourceId: v.id },
    });
    await prisma.agendaVisita.deleteMany({ where: { id: v.id, tenantId } });
    deletedVisitas += 1;
  }

  for (const l of brokenProviderLinks) {
    await prisma.calendarProviderLink.updateMany({
      where: { id: l.id, tenantId },
      data: {
        syncStatus: "CANCELLED",
        lastError: "cleanup-orphan-agenda-events",
        lastSyncAt: new Date(),
      },
    });
    await prisma.calendarEvent.updateMany({
      where: { id: l.eventId, tenantId },
      data: { status: "cancelled", deletedAt: new Date() },
    });
    cancelledProviderLinks += 1;
  }

  for (const l of brokenLicitacion) {
    await prisma.agendaEventLink.deleteMany({ where: { id: l.id, tenantId } });
    deletedLicitacionLinks += 1;
  }

  console.log(
    JSON.stringify({
      applied: true,
      deletedVisitas,
      cancelledProviderLinks,
      deletedLicitacionLinks,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
