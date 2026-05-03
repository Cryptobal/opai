import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

/**
 * GET /api/ops/tickets/dashboard?period=week|month|quarter
 *
 * Returns comprehensive ticket metrics for the dashboard:
 * - KPI cards (open, breached, P1 pending, avg resolution, weekly rate)
 * - Tickets by team (horizontal bars)
 * - Weekly trend (created vs resolved, last 4 weeks)
 * - SLA compliance by priority
 * - Urgent attention list (breached, approaching SLA, unassigned)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "week";

    const now = new Date();
    let periodStart: Date;
    if (period === "today") {
      periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 7);
    } else if (period === "month") {
      periodStart = new Date(now);
      periodStart.setMonth(periodStart.getMonth() - 1);
    } else {
      // quarter
      periodStart = new Date(now);
      periodStart.setMonth(periodStart.getMonth() - 3);
    }

    const tenantId = ctx.tenantId;

    // ── KPI counts ──
    const [
      openCount,
      breachedCount,
      p1PendingCount,
      unassignedCount,
      totalResolved,
      resolvedThisWeek,
      createdThisWeek,
    ] = await Promise.all([
      // Active (open) tickets
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
        },
      }),
      // SLA breached
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
          slaBreached: true,
        },
      }),
      // P1 pending (active P1 tickets)
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
          priority: "p1",
        },
      }),
      // Unassigned active tickets
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ["open", "in_progress", "waiting"] },
          assignedTo: null,
        },
      }),
      // Total resolved (all time, for avg calculation)
      prisma.opsTicket.count({
        where: { tenantId, status: { in: ["resolved", "closed"] } },
      }),
      // Resolved this week
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ["resolved", "closed"] },
          resolvedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Created this week
      prisma.opsTicket.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // ── Average resolution time (last 30 resolved tickets) ──
    const recentResolved = await prisma.opsTicket.findMany({
      where: {
        tenantId,
        status: { in: ["resolved", "closed"] },
        resolvedAt: { not: null },
      },
      select: { createdAt: true, resolvedAt: true },
      orderBy: { resolvedAt: "desc" },
      take: 30,
    });

    let avgResolutionHours = 0;
    if (recentResolved.length > 0) {
      const totalMs = recentResolved.reduce((sum, t) => {
        const resolvedAt = t.resolvedAt ? new Date(t.resolvedAt).getTime() : Date.now();
        return sum + (resolvedAt - new Date(t.createdAt).getTime());
      }, 0);
      avgResolutionHours = Math.round((totalMs / recentResolved.length) / (1000 * 60 * 60) * 10) / 10;
    }

    // ── Tickets by team ──
    const activeTickets = await prisma.opsTicket.findMany({
      where: {
        tenantId,
        status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
      },
      select: { assignedTeam: true },
    });

    const byTeam: Record<string, number> = {};
    for (const t of activeTickets) {
      byTeam[t.assignedTeam] = (byTeam[t.assignedTeam] || 0) + 1;
    }
    const teamData = Object.entries(byTeam)
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count);

    // ── Weekly trend (last 4 weeks) ──
    const weeklyTrend: Array<{ week: string; created: number; resolved: number }> = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
      const weekLabel = `Sem ${4 - w}`;

      const [created, resolved] = await Promise.all([
        prisma.opsTicket.count({
          where: {
            tenantId,
            createdAt: { gte: weekStart, lt: weekEnd },
          },
        }),
        prisma.opsTicket.count({
          where: {
            tenantId,
            resolvedAt: { gte: weekStart, lt: weekEnd },
          },
        }),
      ]);

      weeklyTrend.push({ week: weekLabel, created, resolved });
    }

    // ── SLA compliance by priority ──
    const priorities = ["p1", "p2", "p3", "p4"] as const;
    const slaByPriority: Array<{ priority: string; total: number; compliant: number; percentage: number }> = [];

    for (const p of priorities) {
      const [total, breached] = await Promise.all([
        prisma.opsTicket.count({
          where: {
            tenantId,
            priority: p,
            status: { in: ["resolved", "closed"] },
            resolvedAt: { not: null },
          },
        }),
        prisma.opsTicket.count({
          where: {
            tenantId,
            priority: p,
            status: { in: ["resolved", "closed"] },
            slaBreached: true,
          },
        }),
      ]);

      const compliant = total - breached;
      slaByPriority.push({
        priority: p,
        total,
        compliant,
        percentage: total > 0 ? Math.round((compliant / total) * 100) : 100,
      });
    }

    // ── MTTR (Mean Time To Resolve) por prioridad ──
    // Promedio en horas de la diferencia createdAt → resolvedAt sobre los
    // tickets resueltos del periodo seleccionado.
    const mttrByPriority: Array<{ priority: string; avgHours: number; sample: number }> = [];
    for (const p of priorities) {
      const resolvedInPeriod = await prisma.opsTicket.findMany({
        where: {
          tenantId,
          priority: p,
          status: { in: ["resolved", "closed"] },
          resolvedAt: { gte: periodStart, not: null },
        },
        select: { createdAt: true, resolvedAt: true, slaPausedTotalMs: true },
      });
      let total = 0;
      let count = 0;
      for (const t of resolvedInPeriod) {
        if (!t.resolvedAt) continue;
        const grossMs =
          new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime();
        // Restamos el tiempo en pausa para no inflar el MTTR.
        const netMs = Math.max(0, grossMs - Number(t.slaPausedTotalMs ?? 0));
        total += netMs;
        count++;
      }
      mttrByPriority.push({
        priority: p,
        avgHours: count > 0 ? Math.round((total / count / 3_600_000) * 10) / 10 : 0,
        sample: count,
      });
    }

    // ── First-response time promedio ──
    // Diferencia entre createdAt del ticket y createdAt del primer comentario
    // público (isInternal=false). Si no hay, el ticket no cuenta. Solo
    // tickets creados en el periodo.
    const ticketsForFirstResponse = await prisma.opsTicket.findMany({
      where: {
        tenantId,
        createdAt: { gte: periodStart },
      },
      select: {
        id: true,
        createdAt: true,
        comments: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    let firstResponseSum = 0;
    let firstResponseCount = 0;
    for (const t of ticketsForFirstResponse) {
      const first = t.comments[0];
      if (!first) continue;
      const ms =
        new Date(first.createdAt).getTime() - new Date(t.createdAt).getTime();
      if (ms < 0) continue;
      firstResponseSum += ms;
      firstResponseCount++;
    }
    const avgFirstResponseHours =
      firstResponseCount > 0
        ? Math.round((firstResponseSum / firstResponseCount / 3_600_000) * 10) / 10
        : 0;

    // ── % reaperturas ──
    // Aproximación: ticket que pasó por status=resolved y luego volvió a
    // activo. Sin tabla de eventos no podemos saberlo de forma exacta;
    // usamos un proxy: tickets actualmente activos cuyo status hoy es
    // open/in_progress/waiting Y tienen resolvedAt seteado. Es ruido bajo
    // porque la lógica del transition handler limpia resolvedAt al
    // reabrir solo para "closed", no para "resolved". Documentamos la
    // limitación.
    const [reopenedActiveCount, totalEverResolvedInPeriod] = await Promise.all([
      prisma.opsTicket.count({
        where: {
          tenantId,
          status: { in: ["open", "in_progress", "waiting"] },
          resolvedAt: { gte: periodStart, not: null },
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          resolvedAt: { gte: periodStart, not: null },
        },
      }),
    ]);
    const reopenRate =
      totalEverResolvedInPeriod > 0
        ? Math.round((reopenedActiveCount / totalEverResolvedInPeriod) * 100)
        : 0;

    // ── Mis tickets ──
    const [myActive, myBreached] = await Promise.all([
      prisma.opsTicket.count({
        where: {
          tenantId,
          assignedTo: ctx.userId,
          status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId,
          assignedTo: ctx.userId,
          status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
          slaBreached: true,
        },
      }),
    ]);

    // ── Heatmap horario de creación ──
    // Conteo de tickets creados en el periodo agrupado por (díaSemana, hora).
    // díaSemana: 0=domingo … 6=sábado.
    const ticketsForHeatmap = await prisma.opsTicket.findMany({
      where: {
        tenantId,
        createdAt: { gte: periodStart },
      },
      select: { createdAt: true },
    });
    const heatmap: Array<Array<number>> = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0),
    );
    for (const t of ticketsForHeatmap) {
      const d = new Date(t.createdAt);
      heatmap[d.getDay()][d.getHours()] += 1;
    }
    const heatmapMax = heatmap.reduce(
      (m, row) => row.reduce((mm, v) => (v > mm ? v : mm), m),
      0,
    );

    // ── Urgent attention list ──
    const urgentTickets = await prisma.opsTicket.findMany({
      where: {
        tenantId,
        status: { in: ["open", "in_progress", "waiting", "pending_approval"] },
        OR: [
          { slaBreached: true },
          { assignedTo: null },
          {
            slaDueAt: {
              lte: new Date(now.getTime() + 4 * 60 * 60 * 1000), // within 4 hours
              gte: now,
            },
          },
        ],
      },
      select: {
        id: true,
        code: true,
        title: true,
        priority: true,
        status: true,
        assignedTo: true,
        slaBreached: true,
        slaDueAt: true,
        createdAt: true,
      },
      orderBy: [{ slaBreached: "desc" }, { slaDueAt: "asc" }],
      take: 10,
    });

    const urgentItems = urgentTickets.map((t) => {
      let reason = "";
      if (t.slaBreached) reason = "SLA vencido";
      else if (!t.assignedTo) reason = "Sin asignar";
      else if (t.slaDueAt) {
        const remaining = new Date(t.slaDueAt).getTime() - now.getTime();
        const hours = Math.round(remaining / (1000 * 60 * 60));
        reason = `SLA vence en ${hours}h`;
      }
      return {
        id: t.id,
        code: t.code,
        title: t.title,
        priority: t.priority,
        status: t.status,
        reason,
        slaBreached: t.slaBreached,
        unassigned: !t.assignedTo,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          openCount,
          breachedCount,
          p1PendingCount,
          unassignedCount,
          avgResolutionHours,
          resolvedThisWeek,
          createdThisWeek,
          resolutionRate: createdThisWeek > 0
            ? Math.round((resolvedThisWeek / createdThisWeek) * 100)
            : 100,
        },
        teamData,
        weeklyTrend,
        slaByPriority,
        urgentItems,
        mttrByPriority,
        avgFirstResponseHours,
        firstResponseSample: firstResponseCount,
        reopenRate,
        reopenSample: totalEverResolvedInPeriod,
        myStats: { active: myActive, breached: myBreached },
        heatmap,
        heatmapMax,
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching ticket dashboard:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el dashboard de tickets" },
      { status: 500 },
    );
  }
}
