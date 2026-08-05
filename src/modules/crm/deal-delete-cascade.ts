/**
 * Cascada de borrado de negocio → agenda (OPAI + Google) + instalación condicional.
 *
 * Las llamadas a Google van FUERA de la transacción de BD. Un fallo de Google
 * no aborta el borrado local; el link queda en ERROR/CANCELLED para reintento.
 */

import { prisma } from "@/lib/prisma";
import { cancelOpaiEvent } from "@/modules/calendar/calendar-write";
import { syncCalendarEventToGoogle } from "@/modules/calendar/calendar-google-sync";
import { syncLicitacionToCalendar } from "@/modules/agenda/agenda-sync-licitacion";
import { recordCalendarAudit } from "@/modules/calendar/calendar-audit";
import type { QuoteDeleteBlocker } from "@/modules/cpq/quote-delete-impact";

export type DealAgendaImpact = {
  visitas: Array<{ id: string; title: string; label: string | null; status: string }>;
  licitacionLink: { id: string; syncStatus: string; hasGoogleEvent: boolean } | null;
  counts: { agendaEvents: number; licitacionBands: number };
};

export type DealInstallationImpact = {
  id: string;
  name: string;
  canDelete: boolean;
  deleteByDefault: boolean;
  blockers: QuoteDeleteBlocker[];
} | null;

/** Carga visitas y banda de licitación asociadas al negocio. */
export async function loadDealAgendaImpact(
  tenantId: string,
  dealId: string,
): Promise<DealAgendaImpact> {
  const [visitas, licitacionLink] = await Promise.all([
    prisma.agendaVisita.findMany({
      where: { tenantId, dealId },
      select: { id: true, title: true, label: true, status: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.agendaEventLink.findFirst({
      where: { tenantId, sourceType: "licitacion", sourceId: dealId },
      select: { id: true, syncStatus: true, googleEventId: true },
    }),
  ]);

  return {
    visitas,
    licitacionLink: licitacionLink
      ? {
          id: licitacionLink.id,
          syncStatus: licitacionLink.syncStatus,
          hasGoogleEvent: Boolean(licitacionLink.googleEventId),
        }
      : null,
    counts: {
      agendaEvents: visitas.length,
      licitacionBands: licitacionLink ? 1 : 0,
    },
  };
}

/**
 * Instalación candidata a borrar con el negocio: activada por este deal, o la
 * única instalación de sus cotizaciones. Solo se ofrece si no hay refs externas.
 */
export async function loadDealInstallationImpact(
  tenantId: string,
  dealId: string,
  dealQuoteIds: string[],
): Promise<DealInstallationImpact> {
  const activated = await prisma.crmInstallation.findMany({
    where: { tenantId, activatedByDealId: dealId },
    select: { id: true, name: true },
  });

  let candidates = activated;

  if (candidates.length === 0 && dealQuoteIds.length > 0) {
    const quoteInst = await prisma.cpqQuote.findMany({
      where: {
        tenantId,
        id: { in: dealQuoteIds },
        installationId: { not: null },
      },
      select: { installationId: true },
    });
    const ids = [
      ...new Set(
        quoteInst
          .map((q) => q.installationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 1) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: ids[0], tenantId },
        select: { id: true, name: true },
      });
      if (inst) candidates = [inst];
    }
  }

  if (candidates.length !== 1) return null;

  const inst = candidates[0];
  const blockers = await assessInstallationBlockers(tenantId, inst.id, dealId, dealQuoteIds);
  const canDelete = blockers.length === 0;
  return {
    id: inst.id,
    name: inst.name,
    canDelete,
    deleteByDefault: canDelete,
    blockers,
  };
}

async function assessInstallationBlockers(
  tenantId: string,
  installationId: string,
  dealId: string,
  dealQuoteIds: string[],
): Promise<QuoteDeleteBlocker[]> {
  const blockers: QuoteDeleteBlocker[] = [];

  const otherDealQuotes = await prisma.cpqQuote.count({
    where: {
      tenantId,
      installationId,
      dealId: { not: null, notIn: [dealId] },
    },
  });
  if (otherDealQuotes > 0) {
    blockers.push({
      code: "INSTALLATION_OTHER_DEAL_QUOTES",
      label:
        otherDealQuotes === 1
          ? "usada por 1 cotización de otro negocio"
          : `usada por ${otherDealQuotes} cotizaciones de otro negocio`,
    });
  }

  const orphanQuotes = await prisma.cpqQuote.count({
    where: {
      tenantId,
      installationId,
      dealId: null,
      ...(dealQuoteIds.length > 0 ? { id: { notIn: dealQuoteIds } } : {}),
    },
  });
  if (orphanQuotes > 0) {
    blockers.push({
      code: "INSTALLATION_ORPHAN_QUOTES",
      label:
        orphanQuotes === 1
          ? "usada por 1 cotización sin este negocio"
          : `usada por ${orphanQuotes} cotizaciones sin este negocio`,
    });
  }

  const otherActivated = await prisma.crmInstallation.count({
    where: {
      id: installationId,
      tenantId,
      activatedByDealId: { not: null, notIn: [dealId] },
    },
  });
  // Si activatedByDealId apunta a otro deal, ya no es candidata; por si acaso:
  if (otherActivated > 0) {
    blockers.push({
      code: "INSTALLATION_OTHER_ACTIVATION",
      label: "activada por otro negocio",
    });
  }

  const [puestos, pautas, marcaciones, asignaciones] = await Promise.all([
    prisma.opsPuestoOperativo.count({ where: { tenantId, installationId } }),
    prisma.opsPautaMensual.count({ where: { tenantId, installationId } }),
    prisma.opsMarcacion.count({ where: { tenantId, installationId } }),
    prisma.opsAsignacionGuardia.count({ where: { tenantId, installationId } }),
  ]);

  if (puestos > 0) {
    blockers.push({
      code: "INSTALLATION_OPS_PUESTOS",
      label: `tiene ${puestos} puesto${puestos === 1 ? "" : "s"} operativo${puestos === 1 ? "" : "s"}`,
    });
  }
  if (pautas > 0) {
    blockers.push({
      code: "INSTALLATION_OPS_PAUTAS",
      label: `tiene ${pautas} pauta${pautas === 1 ? "" : "s"} mensual${pautas === 1 ? "" : "es"}`,
    });
  }
  if (marcaciones > 0) {
    blockers.push({
      code: "INSTALLATION_OPS_MARCACIONES",
      label: `tiene ${marcaciones} marcación${marcaciones === 1 ? "" : "es"}`,
    });
  }
  if (asignaciones > 0) {
    blockers.push({
      code: "INSTALLATION_OPS_ASIGNACIONES",
      label: `tiene ${asignaciones} asignación${asignaciones === 1 ? "" : "es"} de guardia`,
    });
  }

  return blockers;
}

export type CascadeAgendaResult = {
  cancelledVisitas: string[];
  deletedVisitas: string[];
  googleErrors: Array<{ eventId: string; error: string }>;
  licitacionCancelled: boolean;
  licitacionLinkDeleted: boolean;
};

/**
 * Cancela en Google y elimina localmente las visitas + banda de licitación del
 * negocio. Debe llamarse ANTES de borrar el CrmDeal (la sync de licitación lo lee).
 */
export async function cascadeCancelDealAgenda(params: {
  tenantId: string;
  dealId: string;
  actorUserId: string;
}): Promise<CascadeAgendaResult> {
  const { tenantId, dealId, actorUserId } = params;
  const result: CascadeAgendaResult = {
    cancelledVisitas: [],
    deletedVisitas: [],
    googleErrors: [],
    licitacionCancelled: false,
    licitacionLinkDeleted: false,
  };

  const visitas = await prisma.agendaVisita.findMany({
    where: { tenantId, dealId },
    select: { id: true, status: true },
  });

  for (const v of visitas) {
    try {
      if (v.status !== "cancelada") {
        const cancelled = await cancelOpaiEvent(tenantId, v.id, actorUserId);
        if (cancelled) {
          result.cancelledVisitas.push(v.id);
          if (cancelled.syncStatus === "ERROR") {
            result.googleErrors.push({
              eventId: v.id,
              error: "Falló la cancelación en Google Calendar",
            });
          }
        }
      } else {
        // Ya cancelada localmente: reintentar sync por si Google quedó vivo.
        const sync = await syncCalendarEventToGoogle(tenantId, v.id);
        if (sync.syncStatus === "ERROR") {
          result.googleErrors.push({
            eventId: v.id,
            error: "Falló la cancelación en Google Calendar",
          });
        }
        result.cancelledVisitas.push(v.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error cancelando visita";
      result.googleErrors.push({ eventId: v.id, error: message });
      console.error(`[CRM] cascadeCancelDealAgenda visita ${v.id}:`, message);
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.agendaVisita.deleteMany({ where: { id: v.id, tenantId } });
        await tx.calendarEvent.updateMany({
          where: { id: v.id, tenantId },
          data: {
            status: "cancelled",
            deletedAt: new Date(),
            dealId: null,
          },
        });
        await tx.agendaEventLink.deleteMany({
          where: { tenantId, sourceType: "agenda_visita", sourceId: v.id },
        });
      });
      result.deletedVisitas.push(v.id);
      await recordCalendarAudit({
        tenantId,
        eventId: v.id,
        actorId: actorUserId,
        action: "cancelled",
        payload: { via: "deal_delete_cascade", dealId },
      }).catch(() => undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error eliminando visita local";
      console.error(`[CRM] cascadeCancelDealAgenda delete visita ${v.id}:`, message);
    }
  }

  // Banda de licitación (AgendaEventLink legacy).
  try {
    const licLink = await prisma.agendaEventLink.findFirst({
      where: { tenantId, sourceType: "licitacion", sourceId: dealId },
      select: { id: true, googleEventId: true },
    });
    if (licLink) {
      const sync = await syncLicitacionToCalendar(tenantId, dealId, "delete", {
        actorUserId,
      });
      result.licitacionCancelled = sync.syncStatus === "CANCELLED" || !licLink.googleEventId;
      if (sync.syncStatus === "ERROR") {
        result.googleErrors.push({
          eventId: `licitacion:${dealId}`,
          error: "Falló la cancelación de la banda de licitación en Google",
        });
      }
      await prisma.agendaEventLink.deleteMany({
        where: { id: licLink.id, tenantId },
      });
      result.licitacionLinkDeleted = true;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error cancelando licitación";
    result.googleErrors.push({ eventId: `licitacion:${dealId}`, error: message });
    console.error(`[CRM] cascadeCancelDealAgenda licitacion ${dealId}:`, message);
  }

  return result;
}
