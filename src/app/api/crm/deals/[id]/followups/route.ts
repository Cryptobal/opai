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
        const proposalDate = deal.proposalSentAt ?? new Date();
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
    const updatedLogs = await prisma.crmFollowUpLog.findMany({
      where: { dealId: deal.id },
      include: {
        emailMessage: {
          select: {
            id: true,
            subject: true,
            toEmails: true,
            sentAt: true,
            status: true,
            openCount: true,
            clickCount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

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
