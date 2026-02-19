/**
 * POST /api/crm/deals/[id]/followups/send-now
 * Envía manualmente un seguimiento pendiente o pausado.
 * Body: { logId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { processFollowUpLog } from "@/lib/process-followup-log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: dealId } = await params;
    const body = await request.json();
    const logId = body?.logId as string;

    if (!logId || typeof logId !== "string") {
      return NextResponse.json(
        { success: false, error: "logId es requerido" },
        { status: 400 }
      );
    }

    const deal = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId: ctx.tenantId },
    });

    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    const log = await prisma.crmFollowUpLog.findFirst({
      where: { id: logId, dealId, tenantId: ctx.tenantId },
    });

    if (!log) {
      return NextResponse.json(
        { success: false, error: "Seguimiento no encontrado o no pertenece a este negocio" },
        { status: 404 }
      );
    }

    if (log.status !== "pending" && log.status !== "paused") {
      return NextResponse.json(
        { success: false, error: `No se puede enviar: el seguimiento ya está ${log.status === "sent" ? "enviado" : log.status}` },
        { status: 400 }
      );
    }

    const result = await processFollowUpLog(logId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    const updatedLogs = await prisma.crmFollowUpLog.findMany({
      where: { dealId },
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

    const followUpLogIds = updatedLogs.map((l) => l.id);
    const followUpMessages =
      followUpLogIds.length > 0
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

    const messageByLogId = new Map<string, (typeof followUpMessages)[number]>();
    for (const email of followUpMessages) {
      if (!email.followUpLogId) continue;
      if (!messageByLogId.has(email.followUpLogId)) {
        messageByLogId.set(email.followUpLogId, email);
      }
    }

    const logsWithEmail = updatedLogs.map((log) => ({
      ...log,
      emailMessage: messageByLogId.get(log.id) ?? null,
    }));

    return NextResponse.json({
      success: true,
      message: `Seguimiento #${log.sequence} enviado correctamente`,
      data: logsWithEmail,
    });
  } catch (error) {
    console.error("Error sending follow-up manually:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar el seguimiento" },
      { status: 500 }
    );
  }
}
