/**
 * API Route: /api/cron/followup-emails
 * GET - Procesar y enviar correos de seguimiento programados
 *
 * Diseñado para ejecutarse periódicamente vía Vercel Cron (cada 15 min).
 * Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processFollowUpLog } from "@/lib/process-followup-log";

export async function GET(request: NextRequest) {
  try {
    // Validate cron secret
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date();
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    // Buscar follow-ups pendientes cuya hora programada ya pasó
    const pendingFollowUps = await prisma.crmFollowUpLog.findMany({
      where: {
        status: "pending",
        scheduledAt: { lte: now },
      },
      include: {
        deal: {
          include: {
            account: true,
            primaryContact: true,
            stage: true,
          },
        },
      },
      take: 50, // Procesar máximo 50 por ejecución
      orderBy: { scheduledAt: "asc" },
    });

    if (pendingFollowUps.length === 0) {
      return NextResponse.json({
        success: true,
        data: { processed: 0, sent: 0, failed: 0, skipped: 0 },
      });
    }

    for (const followUp of pendingFollowUps) {
      try {
        const result = await processFollowUpLog(followUp.id);
        if (result.success) {
          sentCount++;
        } else if (result.skipped) {
          skippedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`❌ Error procesando follow-up ${followUp.id}:`, error);
        await prisma.crmFollowUpLog.update({
          where: { id: followUp.id },
          data: {
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: pendingFollowUps.length,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in followup emails cron:", error);
    return NextResponse.json(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
}
