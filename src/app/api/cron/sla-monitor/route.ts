/**
 * API Route: /api/cron/sla-monitor
 * GET - Check active tickets for SLA breaches every 15 minutes
 *
 * - Excludes pausable statuses (waiting, pending_approval, waiting_client) from breach
 * - Respects snoozedUntil: skips snoozed tickets for notifications
 * - Respects slaPausedAt: skips paused tickets from breach
 * - Re-notifies breached tickets with cadence by priority (escalation)
 * - Batches notifications when >5 tickets breached per team per tenant
 * - Protected with CRON_SECRET env var
 *
 * IMPORTANTE: Este cron sólo crea notificaciones BELL (campana en la app).
 * El envío de EMAILS por SLA se consolida en un digest diario único en
 * /api/cron/sla-daily-digest (6 AM Chile) para evitar spam. Si quieres
 * reactivar emails en tiempo real desde aquí, quita `channels: ["bell"]`.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TICKET_TEAM_CONFIG, type TicketPriority } from "@/lib/tickets";
import { notify } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Statuses that should NOT trigger breach even if past slaDueAt */
const PAUSABLE_STATUSES = ["waiting", "pending_approval", "waiting_client"];

/** Statuses that can breach SLA */
const BREACHABLE_STATUSES = ["open", "in_progress"];

/** Re-notification cadence per priority (in ms) */
const ESCALATION_CADENCE_MS: Record<string, number> = {
  p1: 2 * 60 * 60 * 1000,       // 2 hours
  p2: 6 * 60 * 60 * 1000,       // 6 hours
  p3: 24 * 60 * 60 * 1000,      // 24 hours
  p4: 72 * 60 * 60 * 1000,      // 72 hours
};

/** Batch threshold: if more than this many breached per team, send one batch notification */
const BATCH_THRESHOLD = 5;

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
    // 1. BREACH: Find active tickets that should be marked breached
    //    Only breachable statuses, not paused, past slaDueAt
    // ─────────────────────────────────────────────────────────────
    const breachedTickets = await prisma.opsTicket.findMany({
      where: {
        status: { in: BREACHABLE_STATUSES },
        slaBreached: false,
        slaDueAt: { lte: now },
        slaPausedAt: null, // Not currently paused
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

    // Mark them as breached
    if (breachedTickets.length > 0) {
      await prisma.opsTicket.updateMany({
        where: { id: { in: breachedTickets.map((t) => t.id) } },
        data: { slaBreached: true, lastSlaNotifiedAt: now },
      });

      // Group by tenantId + assignedTeam for batching
      const teamGroups = new Map<string, typeof breachedTickets>();
      for (const t of breachedTickets) {
        // Skip snoozed tickets for notification (but still mark as breached)
        if (t.snoozedUntil && now < new Date(t.snoozedUntil)) continue;
        const key = `${t.tenantId}::${t.assignedTeam}`;
        const arr = teamGroups.get(key) ?? [];
        arr.push(t);
        teamGroups.set(key, arr);
      }

      const notifPromises: Promise<any>[] = [];
      for (const [key, tickets] of teamGroups) {
        const [tenantId, assignedTeam] = key.split("::");
        const teamLabel = TICKET_TEAM_CONFIG[assignedTeam as keyof typeof TICKET_TEAM_CONFIG]?.label ?? assignedTeam;

        if (tickets.length > BATCH_THRESHOLD) {
          // Batch — bell only. Email is consolidated in the daily digest.
          notifPromises.push(
            notify({
              tenantId,
              type: "ticket_sla_breached_batch",
              title: `${tickets.length} tickets con SLA vencido en ${teamLabel}`,
              body: `Hay ${tickets.length} tickets con SLA vencido en ${teamLabel}`,
              link: `/opai/ops/tickets?status=overdue&team=${assignedTeam}`,
              data: { count: tickets.length, assignedTeam, ticketIds: tickets.map((t) => t.id) },
              forceChannels: { bell: true, email: false, push: false },
            }),
          );
        } else {
          for (const t of tickets) {
            notifPromises.push(
              notify({
                tenantId: t.tenantId,
                type: "ticket_sla_breached",
                title: `SLA vencido: ${t.code}`,
                body: `El ticket "${t.title}" (${t.priority.toUpperCase()}) ha superado su plazo de SLA. Equipo: ${teamLabel}`,
                link: `/opai/ops/tickets/${t.id}`,
                data: { ticketId: t.id, code: t.code, priority: t.priority },
                forceChannels: { bell: true, email: false, push: false },
              }),
            );
          }
        }
      }
      await Promise.allSettled(notifPromises);
    }

    // ─────────────────────────────────────────────────────────────
    // 2. ESCALATION: Re-notify already breached tickets by cadence
    // ─────────────────────────────────────────────────────────────
    const allBreachedActive = await prisma.opsTicket.findMany({
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
        lastSlaNotifiedAt: true,
        snoozedUntil: true,
      },
    });

    // Filter by snoozedUntil manually and by cadence
    const ticketsToRenotify = allBreachedActive.filter((t) => {
      if (t.snoozedUntil && now < new Date(t.snoozedUntil)) return false;
      if (!t.lastSlaNotifiedAt) return true; // never notified
      const cadenceMs = ESCALATION_CADENCE_MS[t.priority] ?? ESCALATION_CADENCE_MS.p3;
      return now.getTime() - new Date(t.lastSlaNotifiedAt).getTime() >= cadenceMs;
    });

    if (ticketsToRenotify.length > 0) {
      // Update lastSlaNotifiedAt
      await prisma.opsTicket.updateMany({
        where: { id: { in: ticketsToRenotify.map((t) => t.id) } },
        data: { lastSlaNotifiedAt: now },
      });

      // Group by tenantId + assignedTeam for batching
      const renotifyGroups = new Map<string, typeof ticketsToRenotify>();
      for (const t of ticketsToRenotify) {
        const key = `${t.tenantId}::${t.assignedTeam}`;
        const arr = renotifyGroups.get(key) ?? [];
        arr.push(t);
        renotifyGroups.set(key, arr);
      }

      const renotifPromises: Promise<any>[] = [];
      for (const [key, tickets] of renotifyGroups) {
        const [tenantId, assignedTeam] = key.split("::");
        const teamLabel = TICKET_TEAM_CONFIG[assignedTeam as keyof typeof TICKET_TEAM_CONFIG]?.label ?? assignedTeam;

        if (tickets.length > BATCH_THRESHOLD) {
          renotifPromises.push(
            notify({
              tenantId,
              type: "ticket_sla_breached_batch",
              title: `${tickets.length} tickets con SLA vencido en ${teamLabel}`,
              body: `Hay ${tickets.length} tickets con SLA vencido en ${teamLabel}`,
              link: `/opai/ops/tickets?status=overdue&team=${assignedTeam}`,
              data: { count: tickets.length, assignedTeam, ticketIds: tickets.map((t) => t.id) },
              forceChannels: { bell: true, email: false, push: false },
            }),
          );
        } else {
          for (const t of tickets) {
            renotifPromises.push(
              notify({
                tenantId: t.tenantId,
                type: "ticket_sla_breached",
                title: `SLA vencido (recordatorio): ${t.code}`,
                body: `El ticket "${t.title}" (${t.priority.toUpperCase()}) sigue con SLA vencido. Equipo: ${teamLabel}`,
                link: `/opai/ops/tickets/${t.id}`,
                data: { ticketId: t.id, code: t.code, priority: t.priority },
                forceChannels: { bell: true, email: false, push: false },
              }),
            );
          }
        }
      }
      await Promise.allSettled(renotifPromises);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. APPROACHING: Find tickets approaching SLA (within 1 hour)
    // ─────────────────────────────────────────────────────────────
    const approachingTickets = await prisma.opsTicket.findMany({
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
        slaDueAt: true,
        snoozedUntil: true,
      },
    });

    // Filter out snoozed and avoid duplicate notifications
    const nonSnoozedApproaching = approachingTickets.filter(
      (t) => !t.snoozedUntil || now >= new Date(t.snoozedUntil),
    );

    if (nonSnoozedApproaching.length > 0) {
      // Check for recent approaching notifications to avoid duplicates
      const recentNotifs = await prisma.notification.findMany({
        where: {
          type: "ticket_sla_approaching",
          createdAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
        },
        select: { data: true },
      });

      const recentTicketIds = new Set(
        recentNotifs
          .map((n) => (n.data as any)?.ticketId)
          .filter(Boolean),
      );

      const newApproaching = nonSnoozedApproaching.filter(
        (t) => !recentTicketIds.has(t.id),
      );

      if (newApproaching.length > 0) {
        await Promise.allSettled(
          newApproaching.map((t) => {
            const minsLeft = Math.round(
              (new Date(t.slaDueAt!).getTime() - now.getTime()) / (1000 * 60),
            );
            return notify({
              tenantId: t.tenantId,
              type: "ticket_sla_approaching",
              title: `SLA próximo a vencer: ${t.code}`,
              body: `El ticket "${t.title}" vence en ~${minsLeft} minutos`,
              link: `/opai/ops/tickets/${t.id}`,
              data: { ticketId: t.id, code: t.code, priority: t.priority },
              forceChannels: { bell: true, email: false, push: false },
            });
          }),
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        breached: breachedTickets.length,
        escalated: ticketsToRenotify.length,
        approaching: approachingTickets.length,
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
