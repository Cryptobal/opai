/**
 * API Route: /api/cron/sla-daily-digest
 * GET - Daily digest of SLA-breached tickets per tenant
 *
 * Runs ONCE per day (6 AM Chile / 10 UTC). Reemplaza el spam de emails por
 * cada breach + re-notificación que antes enviaba sla-monitor cada 15 min.
 *
 * Por cada tenant con tickets con SLA vencido (no resueltos, no pausados),
 * envía UN solo email consolidado a los usuarios que tengan habilitado
 * `ticket_sla_breached_batch` en sus preferencias.
 *
 * No crea notificaciones bell: los bells ya se crean en tiempo real desde
 * /api/cron/sla-monitor (que corre cada 15 min y usa `channels: ['bell']`).
 *
 * Protected with CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendNotification } from "@/lib/notification-service";
import { TICKET_TEAM_CONFIG } from "@/lib/tickets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BREACHABLE_STATUSES = ["open", "in_progress"];
const PAUSABLE_STATUSES = ["waiting", "pending_approval", "waiting_client"];

interface BreachedTicket {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  priority: string;
  assignedTeam: string;
  slaDueAt: Date | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Traer todos los tickets con SLA vencido que siguen abiertos y no pausados.
    // Incluimos también los en estado "waiting*" porque cuentan como pendientes
    // para el resumen (aunque el cronómetro esté pausado).
    const breached = await prisma.opsTicket.findMany({
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
        slaDueAt: true,
      },
      orderBy: [{ priority: "asc" }, { slaDueAt: "asc" }],
    });

    if (breached.length === 0) {
      return NextResponse.json({
        success: true,
        tenants: 0,
        tickets: 0,
        emailsSent: 0,
      });
    }

    // Agrupar por tenant
    const byTenant = new Map<string, BreachedTicket[]>();
    for (const t of breached) {
      const arr = byTenant.get(t.tenantId) ?? [];
      arr.push(t as BreachedTicket);
      byTenant.set(t.tenantId, arr);
    }

    let emailsSent = 0;
    let errors = 0;

    for (const [tenantId, tickets] of byTenant) {
      try {
        // Agrupar por equipo para el resumen
        const teamGroups = new Map<string, BreachedTicket[]>();
        for (const t of tickets) {
          const arr = teamGroups.get(t.assignedTeam) ?? [];
          arr.push(t);
          teamGroups.set(t.assignedTeam, arr);
        }

        // Contar por prioridad para el encabezado
        const priorityCount: Record<string, number> = {};
        for (const t of tickets) {
          priorityCount[t.priority] = (priorityCount[t.priority] ?? 0) + 1;
        }

        const total = tickets.length;
        const teamSummary = Array.from(teamGroups.entries())
          .map(([team, ts]) => {
            const label =
              TICKET_TEAM_CONFIG[team as keyof typeof TICKET_TEAM_CONFIG]?.label ??
              team;
            return `• ${label}: ${ts.length} ticket${ts.length === 1 ? "" : "s"}`;
          })
          .join("\n");

        const priorityParts: string[] = [];
        for (const pKey of ["p1", "p2", "p3", "p4"]) {
          const n = priorityCount[pKey];
          if (n) priorityParts.push(`${n} ${pKey.toUpperCase()}`);
        }
        const prioritySummary = priorityParts.length > 0 ? priorityParts.join(" · ") : "";

        const title = `Resumen diario SLA: ${total} ticket${total === 1 ? "" : "s"} con SLA vencido`;
        const message =
          `Hay ${total} ticket${total === 1 ? "" : "s"} con SLA vencido pendiente${total === 1 ? "" : "s"} de resolución.` +
          (prioritySummary ? `\nDistribución: ${prioritySummary}.` : "") +
          `\n\nPor equipo:\n${teamSummary}` +
          `\n\nEste resumen se envía una vez al día. Para ver el detalle, abre OPAI.`;

        // Enviar sólo email — los bells ya se crearon en tiempo real desde
        // el cron sla-monitor (cada 15 min) cuando ocurrió cada breach.
        // useTypeDefaultForMissing=true porque este digest es benigno y debe
        // llegar por defecto a usuarios que aún no abrieron sus preferencias
        // a configurar este tipo. Los que lo hayan desactivado explícitamente
        // (email=false) se respetan.
        await sendNotification({
          tenantId,
          type: "ticket_sla_breached_batch",
          title,
          message,
          data: {
            count: total,
            ticketIds: tickets.map((t) => t.id),
            date: now.toISOString().slice(0, 10),
            digest: true,
          },
          link: `/ops/tickets?status=overdue`,
          channels: ["email"],
          useTypeDefaultForMissing: true,
        });
        emailsSent++;
      } catch (e) {
        errors++;
        console.error(`[sla-daily-digest] Error for tenant ${tenantId}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      tenants: byTenant.size,
      tickets: breached.length,
      emailsSent,
      errors,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[sla-daily-digest] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
