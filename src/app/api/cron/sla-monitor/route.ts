/**
 * API Route: /api/cron/sla-monitor
 * GET - Detecta SLA vencidos y notifica AL RESPONSABLE del ticket cada 15 min.
 *
 * Reglas de negocio:
 * - Sólo se notifica al `assignedTo` del ticket. Sin responsable → sin bell.
 *   El resumen diario por equipo se envía vía /api/cron/sla-daily-digest (Slack/email según prefs).
 * - Estados pausables (waiting/pending_approval/waiting_client) no breachean
 *   aunque pasen su slaDueAt. Tickets con slaPausedAt están fuera.
 * - Si un usuario tiene >1 SLA vencido en la misma corrida, recibe UNA campana
 *   consolidada ("Tienes N tickets con SLA vencido") en vez de N campanas.
 * - Re-notificación con cadencia por prioridad. lastSlaNotifiedAt se actualiza
 *   en cada notificación efectiva.
 * - dedupKey en data para defensa frente a reruns accidentales del cron.
 *
 * Sólo crea bells. El resumen diario consolidado va en sla-daily-digest (6 AM Chile).
 *
 * Protected with CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { type TicketPriority } from "@/lib/tickets";
import { notify } from "@/lib/notifications/notify";
import {
  getSlaReminderPolicies,
  DEFAULT_SLA_REMINDER_POLICY,
  type SlaPriority,
  type SlaReminderPolicy,
} from "@/lib/tickets-sla-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PAUSABLE_STATUSES = ["waiting", "pending_approval", "waiting_client"];
const BREACHABLE_STATUSES = ["open", "in_progress"];

/** Prioridad → clave de política (defensivo ante valores inesperados → p3). */
function prioKey(priority: string): SlaPriority {
  return (["p1", "p2", "p3", "p4"].includes(priority) ? priority : "p3") as SlaPriority;
}

interface SlaTicket {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  priority: string;
  assignedTeam: string;
  assignedTo: string | null;
  snoozedUntil: Date | null;
  slaDueAt?: Date | null;
  lastSlaNotifiedAt?: Date | null;
}

/**
 * Notifica a un usuario sobre sus tickets con SLA vencido.
 * - 1 ticket: notificación individual.
 * - >1 ticket: notificación consolidada por usuario.
 */
async function notifyUserBreaches(
  tenantId: string,
  userId: string,
  tickets: SlaTicket[],
  isReminder: boolean,
): Promise<void> {
  if (tickets.length === 0) return;

  const dateKey = new Date().toISOString().slice(0, 10);

  if (tickets.length === 1) {
    const t = tickets[0];
    const titlePrefix = isReminder ? "SLA vencido (recordatorio)" : "SLA vencido";
    await notify({
      tenantId,
      type: "ticket_sla_breached",
      targetIds: [userId],
      targetType: "ADMIN",
      title: `${titlePrefix}: ${t.code}`,
      body: `El ticket "${t.title}" (${t.priority.toUpperCase()}) ha superado su plazo de SLA.`,
      link: `/ops/tickets/${t.id}`,
      data: {
        ticketId: t.id,
        code: t.code,
        priority: t.priority,
        dedupKey: isReminder
          ? `sla_reminder:${userId}:${t.id}:${dateKey}`
          : `sla_breach:${userId}:${t.id}`,
      },
      forceChannels: { bell: true, email: false, push: true },
    });
    return;
  }

  // Resumen por usuario
  const titlePrefix = isReminder ? "Recordatorio SLA" : "SLA vencido";
  await notify({
    tenantId,
    type: "ticket_sla_breached",
    targetIds: [userId],
    targetType: "ADMIN",
    title: `${titlePrefix}: ${tickets.length} tickets tuyos con SLA vencido`,
    body: `Tienes ${tickets.length} tickets asignados con SLA vencido.`,
    link: `/ops/tickets?status=overdue&assignee=me`,
    data: {
      count: tickets.length,
      ticketIds: tickets.map((t) => t.id),
      dedupKey: isReminder
        ? `sla_reminder_user:${userId}:${dateKey}`
        : `sla_breach_user:${userId}:${dateKey}`,
    },
    forceChannels: { bell: true, email: false, push: true },
  });
}

/**
 * Notifica a un usuario sobre sus tickets próximos a vencer (consolidado o individual).
 */
async function notifyUserApproaching(
  tenantId: string,
  userId: string,
  tickets: Array<SlaTicket & { slaDueAt: Date }>,
): Promise<void> {
  if (tickets.length === 0) return;
  const now = Date.now();
  const dateKey = new Date().toISOString().slice(0, 10);

  if (tickets.length === 1) {
    const t = tickets[0];
    const minsLeft = Math.round((t.slaDueAt.getTime() - now) / (1000 * 60));
    await notify({
      tenantId,
      type: "ticket_sla_approaching",
      targetIds: [userId],
      targetType: "ADMIN",
      title: `SLA próximo a vencer: ${t.code}`,
      body: `El ticket "${t.title}" vence en ~${minsLeft} minutos.`,
      link: `/ops/tickets/${t.id}`,
      data: {
        ticketId: t.id,
        code: t.code,
        priority: t.priority,
        dedupKey: `sla_approaching:${userId}:${t.id}:${dateKey}`,
      },
      forceChannels: { bell: true, email: false, push: true },
    });
    return;
  }

  await notify({
    tenantId,
    type: "ticket_sla_approaching",
    targetIds: [userId],
    targetType: "ADMIN",
    title: `${tickets.length} tickets tuyos próximos a vencer SLA`,
    body: `Tienes ${tickets.length} tickets asignados que vencerán pronto.`,
    link: `/ops/tickets?assignee=me&slaSoon=true`,
    data: {
      count: tickets.length,
      ticketIds: tickets.map((t) => t.id),
      dedupKey: `sla_approaching_user:${userId}:${dateKey}`,
    },
    forceChannels: { bell: true, email: false, push: true },
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // ─────────────────────────────────────────────────────────────
    // 1. BREACH: marcar tickets recién vencidos y notificar al responsable
    // ─────────────────────────────────────────────────────────────
    const breachedTickets = await prisma.opsTicket.findMany({
      where: {
        status: { in: BREACHABLE_STATUSES },
        slaBreached: false,
        slaDueAt: { lte: now },
        slaPausedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
        title: true,
        priority: true,
        assignedTeam: true,
        assignedTo: true,
        snoozedUntil: true,
      },
    });

    let notifiedBreach = 0;
    if (breachedTickets.length > 0) {
      // Marcar como breached siempre (para que sla-daily-digest los considere)
      await prisma.opsTicket.updateMany({
        where: { id: { in: breachedTickets.map((t) => t.id) } },
        data: { slaBreached: true, lastSlaNotifiedAt: now },
      });

      // Política por tenant (intervalos, tope diario, "solo resumen diario").
      const policies = await getSlaReminderPolicies([
        ...new Set(breachedTickets.map((t) => t.tenantId)),
      ]);
      const policyFor = (tenantId: string): SlaReminderPolicy =>
        policies.get(tenantId) ?? DEFAULT_SLA_REMINDER_POLICY;

      // Filtrar tickets sin responsable, snoozed, o de prioridad "solo resumen
      // diario" (siguen marcados breached → el digest los cubre, sin campana).
      const toNotify = breachedTickets.filter(
        (t) =>
          t.assignedTo &&
          !(t.snoozedUntil && now < new Date(t.snoozedUntil)) &&
          !policyFor(t.tenantId).digestOnly[prioKey(t.priority)],
      );

      // Agrupar por (tenantId, assignedTo)
      const groups = new Map<string, SlaTicket[]>();
      for (const t of toNotify) {
        const key = `${t.tenantId}::${t.assignedTo}`;
        const arr = groups.get(key) ?? [];
        arr.push(t as SlaTicket);
        groups.set(key, arr);
      }

      const promises: Promise<void>[] = [];
      for (const [key, tickets] of groups) {
        const [tenantId, userId] = key.split("::");
        promises.push(notifyUserBreaches(tenantId, userId, tickets, false));
      }
      await Promise.allSettled(promises);
      notifiedBreach = groups.size;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. ESCALATION: re-notificar tickets ya breached según cadencia
    // ─────────────────────────────────────────────────────────────
    const allBreached = await prisma.opsTicket.findMany({
      where: {
        status: { in: [...BREACHABLE_STATUSES, ...PAUSABLE_STATUSES] },
        slaBreached: true,
        slaPausedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
        title: true,
        priority: true,
        assignedTeam: true,
        assignedTo: true,
        lastSlaNotifiedAt: true,
        snoozedUntil: true,
      },
    });

    const escPolicies = await getSlaReminderPolicies([
      ...new Set(allBreached.map((t) => t.tenantId)),
    ]);
    const escPolicyFor = (tenantId: string): SlaReminderPolicy =>
      escPolicies.get(tenantId) ?? DEFAULT_SLA_REMINDER_POLICY;

    // Tope diario: cuántos recordatorios YA se enviaron hoy por ticket. Se cuentan
    // las notificaciones de recordatorio (dedupKey `sla_reminder*`) creadas hoy,
    // tanto individuales (data.ticketId) como consolidadas (data.ticketIds).
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const todaysReminders = await prisma.notification.findMany({
      where: { type: "ticket_sla_breached", createdAt: { gte: dayStart } },
      select: { data: true },
    });
    const remindersToday = new Map<string, number>();
    for (const n of todaysReminders) {
      const d = (n.data as Record<string, unknown> | null) ?? {};
      const dk = typeof d.dedupKey === "string" ? d.dedupKey : "";
      if (!dk.startsWith("sla_reminder")) continue; // ignora el breach inicial
      const ids: string[] = [];
      if (typeof d.ticketId === "string") ids.push(d.ticketId);
      if (Array.isArray(d.ticketIds)) ids.push(...d.ticketIds.filter((x): x is string => typeof x === "string"));
      for (const id of ids) remindersToday.set(id, (remindersToday.get(id) ?? 0) + 1);
    }

    const ticketsToRenotify = allBreached.filter((t) => {
      if (!t.assignedTo) return false; // sin responsable: sólo digest diario
      if (t.snoozedUntil && now < new Date(t.snoozedUntil)) return false;
      const policy = escPolicyFor(t.tenantId);
      if (policy.digestOnly[prioKey(t.priority)]) return false; // solo resumen diario
      if ((remindersToday.get(t.id) ?? 0) >= policy.dailyCap) return false; // tope diario
      if (!t.lastSlaNotifiedAt) return true;
      const cadenceMs = policy.intervals[prioKey(t.priority)] * 60 * 60 * 1000;
      return now.getTime() - new Date(t.lastSlaNotifiedAt).getTime() >= cadenceMs;
    });

    let notifiedEscalation = 0;
    if (ticketsToRenotify.length > 0) {
      await prisma.opsTicket.updateMany({
        where: { id: { in: ticketsToRenotify.map((t) => t.id) } },
        data: { lastSlaNotifiedAt: now },
      });

      const groups = new Map<string, SlaTicket[]>();
      for (const t of ticketsToRenotify) {
        const key = `${t.tenantId}::${t.assignedTo}`;
        const arr = groups.get(key) ?? [];
        arr.push(t as SlaTicket);
        groups.set(key, arr);
      }

      const promises: Promise<void>[] = [];
      for (const [key, tickets] of groups) {
        const [tenantId, userId] = key.split("::");
        promises.push(notifyUserBreaches(tenantId, userId, tickets, true));
      }
      await Promise.allSettled(promises);
      notifiedEscalation = groups.size;
    }

    // ─────────────────────────────────────────────────────────────
    // 3. APPROACHING: tickets que vencen en <= 1h, sólo al responsable
    // ─────────────────────────────────────────────────────────────
    const approachingRaw = await prisma.opsTicket.findMany({
      where: {
        status: { in: [...BREACHABLE_STATUSES, ...PAUSABLE_STATUSES] },
        slaBreached: false,
        slaDueAt: { gt: now, lte: oneHourFromNow },
        slaPausedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
        title: true,
        priority: true,
        assignedTeam: true,
        assignedTo: true,
        slaDueAt: true,
        snoozedUntil: true,
      },
    });

    // Filtrar: con responsable, no snoozed, y sin notificación previa en las
    // últimas 2 horas (defensa contra duplicados por reruns y entre cadencias).
    const approachingFiltered = approachingRaw.filter(
      (t) =>
        t.assignedTo &&
        t.slaDueAt &&
        !(t.snoozedUntil && now < new Date(t.snoozedUntil)),
    );

    let notifiedApproaching = 0;
    if (approachingFiltered.length > 0) {
      // Anti-duplicado: descartar tickets que ya tuvieron notificación
      // approaching para el mismo usuario en las últimas 2 horas.
      const recentNotifs = await prisma.notification.findMany({
        where: {
          type: "ticket_sla_approaching",
          createdAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
        },
        select: { data: true },
      });

      const recentKeys = new Set<string>();
      for (const n of recentNotifs) {
        const d = (n.data as Record<string, unknown> | null) ?? {};
        const ticketId =
          typeof d.ticketId === "string" ? d.ticketId : null;
        const ticketIds = Array.isArray(d.ticketIds)
          ? (d.ticketIds.filter((x) => typeof x === "string") as string[])
          : [];
        const targetUserId =
          typeof d.targetUserId === "string" ? d.targetUserId : null;
        if (!targetUserId) continue;
        if (ticketId) recentKeys.add(`${targetUserId}::${ticketId}`);
        for (const id of ticketIds) recentKeys.add(`${targetUserId}::${id}`);
      }

      const newApproaching = approachingFiltered.filter(
        (t) => !recentKeys.has(`${t.assignedTo}::${t.id}`),
      );

      if (newApproaching.length > 0) {
        const groups = new Map<
          string,
          Array<SlaTicket & { slaDueAt: Date }>
        >();
        for (const t of newApproaching) {
          const key = `${t.tenantId}::${t.assignedTo}`;
          const arr = groups.get(key) ?? [];
          arr.push({ ...(t as SlaTicket), slaDueAt: t.slaDueAt as Date });
          groups.set(key, arr);
        }

        const promises: Promise<void>[] = [];
        for (const [key, tickets] of groups) {
          const [tenantId, userId] = key.split("::");
          promises.push(notifyUserApproaching(tenantId, userId, tickets));
        }
        await Promise.allSettled(promises);
        notifiedApproaching = groups.size;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        breachedTotal: breachedTickets.length,
        breachedNotifiedUsers: notifiedBreach,
        escalatedTotal: ticketsToRenotify.length,
        escalatedNotifiedUsers: notifiedEscalation,
        approachingTotal: approachingFiltered.length,
        approachingNotifiedUsers: notifiedApproaching,
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("[CRON] SLA monitor error:", error);
    return NextResponse.json(
      { success: false, error: "SLA monitor failed" },
      { status: 500 },
    );
  }
}
