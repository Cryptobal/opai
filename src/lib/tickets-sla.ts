/**
 * Servicio de controles SLA reutilizable (Fase 7.1): aplazar, pausar/reanudar y
 * silenciar avisos. Extraído para que Slack (botones de la tarjeta del ticket)
 * ejecute los MISMOS controles del detalle web con la identidad real del actor.
 * Toda mutación va scoped por tenant y registra su evento (recordTicketEvent),
 * espejando la lógica inline del PATCH de `/api/ops/tickets/[id]`.
 */

import { prisma } from "@/lib/prisma";
import { recordTicketEvent } from "@/lib/tickets-events";

export interface SlaResult {
  ok: boolean;
  error?: string;
  code?: string;
}

type SlaExtensionEntry = { at: string; by: string; fromDueAt: string; toDueAt: string; reason: string };

async function loadTicket(tenantId: string, ticketId: string) {
  return prisma.opsTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: { code: true, slaDueAt: true, slaExtensions: true, slaPausedAt: true, slaPausedTotalMs: true },
  });
}

/** Aplaza el SLA a una nueva fecha futura, con motivo (≥10 chars). */
export async function extendSla(p: {
  tenantId: string;
  actorId: string;
  ticketId: string;
  newDueAt: Date;
  reason: string;
}): Promise<SlaResult> {
  const t = await loadTicket(p.tenantId, p.ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado" };
  const now = new Date();
  if (isNaN(p.newDueAt.getTime()) || p.newDueAt <= now) return { ok: false, error: "La fecha debe ser futura." };
  const reason = p.reason.trim();
  if (reason.length < 10) return { ok: false, error: "El motivo debe tener al menos 10 caracteres." };

  const prev = (t.slaExtensions as SlaExtensionEntry[] | null) ?? [];
  const entry: SlaExtensionEntry = {
    at: now.toISOString(), by: p.actorId,
    fromDueAt: t.slaDueAt?.toISOString() ?? "", toDueAt: p.newDueAt.toISOString(), reason,
  };
  await prisma.opsTicket.updateMany({
    where: { id: p.ticketId, tenantId: p.tenantId },
    data: { slaDueAt: p.newDueAt, slaExtensions: [...prev, entry] as never, slaBreached: false },
  });
  await recordTicketEvent({ tenantId: p.tenantId, ticketId: p.ticketId, type: "sla_extended", actorId: p.actorId, data: { to: p.newDueAt.toISOString(), reason } });
  return { ok: true, code: t.code };
}

/** Pausa o reanuda el SLA (decide según el estado actual). Al reanudar extiende el plazo. */
export async function togglePauseSla(p: {
  tenantId: string;
  actorId: string;
  ticketId: string;
  reason?: string;
}): Promise<SlaResult> {
  const t = await loadTicket(p.tenantId, p.ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado" };
  const now = new Date();

  if (!t.slaPausedAt) {
    await prisma.opsTicket.updateMany({
      where: { id: p.ticketId, tenantId: p.tenantId },
      data: { slaPausedAt: now, slaPausedReason: p.reason?.trim() || null },
    });
    await recordTicketEvent({ tenantId: p.tenantId, ticketId: p.ticketId, type: "sla_paused", actorId: p.actorId, data: { reason: p.reason ?? null } });
    return { ok: true, code: t.code };
  }

  const pausedMs = now.getTime() - new Date(t.slaPausedAt).getTime();
  const data: Record<string, unknown> = {
    slaPausedTotalMs: BigInt(Number(t.slaPausedTotalMs ?? 0) + pausedMs),
    slaPausedAt: null,
    slaPausedReason: null,
  };
  if (t.slaDueAt) {
    const extended = new Date(t.slaDueAt.getTime() + pausedMs);
    data.slaDueAt = extended;
    const prev = (t.slaExtensions as SlaExtensionEntry[] | null) ?? [];
    data.slaExtensions = [
      ...prev,
      { at: now.toISOString(), by: p.actorId, fromDueAt: t.slaDueAt.toISOString(), toDueAt: extended.toISOString(), reason: "Reanudación de pausa SLA (extensión automática)" },
    ] as never;
    if (extended > now) data.slaBreached = false;
  }
  await prisma.opsTicket.updateMany({ where: { id: p.ticketId, tenantId: p.tenantId }, data });
  await recordTicketEvent({ tenantId: p.tenantId, ticketId: p.ticketId, type: "sla_resumed", actorId: p.actorId, data: { extendedToDueAt: data.slaDueAt instanceof Date ? data.slaDueAt.toISOString() : null } });
  return { ok: true, code: t.code };
}

/** Silencia (o reactiva) los avisos hasta una fecha. `until = null` reactiva. */
export async function snoozeSla(p: {
  tenantId: string;
  actorId: string;
  ticketId: string;
  until: Date | null;
}): Promise<SlaResult> {
  const t = await loadTicket(p.tenantId, p.ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado" };
  if (p.until && (isNaN(p.until.getTime()) || p.until <= new Date())) return { ok: false, error: "La fecha debe ser futura." };
  await prisma.opsTicket.updateMany({ where: { id: p.ticketId, tenantId: p.tenantId }, data: { snoozedUntil: p.until } });
  await recordTicketEvent({ tenantId: p.tenantId, ticketId: p.ticketId, type: p.until ? "sla_snoozed" : "sla_unsnoozed", actorId: p.actorId, data: p.until ? { until: p.until.toISOString() } : {} });
  return { ok: true, code: t.code };
}
