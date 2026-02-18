/**
 * API Route: /api/cron/sla-monitor
 * GET - Check active tickets for SLA breaches every 15 minutes
 *
 * - Marks tickets with slaBreached = true when slaDueAt has passed
 * - Creates notifications for breached tickets and tickets approaching SLA
 * - Protected with CRON_SECRET env var
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TICKET_TEAM_CONFIG } from "@/lib/tickets";
import { sendNotification } from "@/lib/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // 1. Find active tickets with breached SLA (not yet marked)
    const breachedTickets = await prisma.opsTicket.findMany({
      where: {
        status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
        slaBreached: false,
        slaDueAt: { lte: now },
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
        title: true,
        priority: true,
        assignedTeam: true,
        assignedTo: true,
      },
    });

    // Mark them as breached
    if (breachedTickets.length > 0) {
      await prisma.opsTicket.updateMany({
        where: { id: { in: breachedTickets.map((t) => t.id) } },
        data: { slaBreached: true },
      });

      await Promise.allSettled(
        breachedTickets.map((t) =>
          sendNotification({
            tenantId: t.tenantId,
            type: "ticket_sla_breached",
            title: `SLA vencido: ${t.code}`,
            message: `El ticket "${t.title}" (${t.priority.toUpperCase()}) ha superado su plazo de SLA. Equipo: ${TICKET_TEAM_CONFIG[t.assignedTeam as keyof typeof TICKET_TEAM_CONFIG]?.label ?? t.assignedTeam}`,
            data: { ticketId: t.id, code: t.code, priority: t.priority },
            link: `/ops/tickets/${t.id}`,
          })
        )
      );
    }

    // 2. Find tickets approaching SLA (within 1 hour, not yet breached)
    const approachingTickets = await prisma.opsTicket.findMany({
      where: {
        status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
        slaBreached: false,
        slaDueAt: { gt: now, lte: oneHourFromNow },
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
        title: true,
        priority: true,
        assignedTeam: true,
        slaDueAt: true,
      },
    });

    // Create approaching-SLA notifications (avoid duplicates by checking recent)
    if (approachingTickets.length > 0) {
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

      const newApproaching = approachingTickets.filter(
        (t) => !recentTicketIds.has(t.id),
      );

      if (newApproaching.length > 0) {
        await Promise.allSettled(
          newApproaching.map((t) => {
            const minsLeft = Math.round(
              (new Date(t.slaDueAt!).getTime() - now.getTime()) / (1000 * 60),
            );
            return sendNotification({
              tenantId: t.tenantId,
              type: "ticket_sla_approaching",
              title: `SLA próximo a vencer: ${t.code}`,
              message: `El ticket "${t.title}" vence en ~${minsLeft} minutos`,
              data: { ticketId: t.id, code: t.code, priority: t.priority },
              link: `/ops/tickets/${t.id}`,
            });
          })
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        breached: breachedTickets.length,
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
