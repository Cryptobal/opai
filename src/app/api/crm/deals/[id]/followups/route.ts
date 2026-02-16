/**
 * API Route: /api/crm/deals/[id]/followups
 * POST - Control manual de follow-ups de un deal
 *
 * Actions:
 *   - pause: Pausar follow-ups pendientes
 *   - resume: Reanudar follow-ups pausados
 *   - restart: Reprogramar follow-ups desde hoy (cancela anteriores)
 *   - cancel: Cancelar todos los follow-ups pendientes
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  scheduleFollowUps,
  cancelPendingFollowUps,
  pauseFollowUps,
  resumeFollowUps,
} from "@/lib/followup-scheduler";

const VALID_ACTIONS = ["pause", "resume", "restart", "cancel"] as const;
type FollowUpAction = (typeof VALID_ACTIONS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = await request.json();
    const action = body?.action as string;

    if (!VALID_ACTIONS.includes(action as FollowUpAction)) {
      return NextResponse.json(
        { success: false, error: `Acción inválida. Opciones: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const deal = await prisma.crmDeal.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    let message: string;

    switch (action as FollowUpAction) {
      case "pause": {
        const count = await pauseFollowUps(deal.id);
        message = count > 0 ? `${count} seguimiento(s) pausado(s)` : "No hay seguimientos pendientes para pausar";
        break;
      }
      case "resume": {
        const count = await resumeFollowUps(deal.id);
        message = count > 0 ? `${count} seguimiento(s) reanudado(s)` : "No hay seguimientos pausados para reanudar";
        break;
      }
      case "restart": {
        const result = await scheduleFollowUps({
          tenantId: ctx.tenantId,
          dealId: deal.id,
          proposalDate: new Date(),
        });
        message = result.scheduled
          ? `Seguimientos reprogramados desde hoy`
          : result.reason || "No se pudieron reprogramar";
        break;
      }
      case "cancel": {
        const count = await cancelPendingFollowUps(deal.id, "Cancelado manualmente por usuario");
        message = count > 0 ? `${count} seguimiento(s) cancelado(s)` : "No hay seguimientos pendientes para cancelar";
        break;
      }
    }

    // Reload follow-up logs for the response
    const updatedLogsRaw = await prisma.crmFollowUpLog.findMany({
      where: { dealId: deal.id },
      select: {
        id: true,
        sequence: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        error: true,
        createdAt: true,
      },
      orderBy: [{ sequence: "asc" }, { createdAt: "desc" }],
    });
    const followUpLogIds = updatedLogsRaw.map((log) => log.id);
    const followUpMessages = followUpLogIds.length > 0
      ? await prisma.crmEmailMessage.findMany({
          where: {
            tenantId: ctx.tenantId,
            followUpLogId: { in: followUpLogIds },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            followUpLogId: true,
            subject: true,
            toEmails: true,
            status: true,
            sentAt: true,
            deliveredAt: true,
            openCount: true,
            clickCount: true,
            bouncedAt: true,
          },
        })
      : [];

    const messageByFollowUpLogId = new Map<string, (typeof followUpMessages)[number]>();
    for (const email of followUpMessages) {
      if (!email.followUpLogId) continue;
      if (!messageByFollowUpLogId.has(email.followUpLogId)) {
        messageByFollowUpLogId.set(email.followUpLogId, email);
      }
    }

    const updatedLogs = updatedLogsRaw.map((log) => ({
      id: log.id,
      sequence: log.sequence,
      status: log.status,
      scheduledAt: log.scheduledAt,
      sentAt: log.sentAt,
      error: log.error,
      createdAt: log.createdAt,
      emailMessage: messageByFollowUpLogId.get(log.id) ?? null,
    }));

    return NextResponse.json({
      success: true,
      message,
      data: updatedLogs,
    });
  } catch (error) {
    console.error("Error managing deal follow-ups:", error);
    return NextResponse.json(
      { success: false, error: "Error al gestionar seguimientos" },
      { status: 500 }
    );
  }
}
