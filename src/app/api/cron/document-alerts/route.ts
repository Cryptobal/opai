/**
 * API Route: /api/cron/document-alerts
 * GET - Verificar documentos por vencer y vencidos, crear notificaciones + enviar emails
 *
 * Diseñado para ejecutarse diariamente vía Vercel Cron o similar.
 * Protegido con un token secreto (CRON_SECRET env var).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, format } from "date-fns";
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiringCount = 0;
    let expiredCount = 0;
    let emailsSent = 0;

    // 1. Find active documents approaching expiration
    const activeDocuments = await prisma.document.findMany({
      where: {
        status: "active",
        expirationDate: { not: null },
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        expirationDate: true,
        alertDaysBefore: true,
      },
    });

    for (const doc of activeDocuments) {
      if (!doc.expirationDate) continue;

      const alertDate = addDays(today, doc.alertDaysBefore);
      const expDate = new Date(doc.expirationDate);
      const daysRemaining = Math.ceil(
        (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // If expiration is within the alert window
      if (expDate <= alertDate && expDate > today) {
        // Check if we already sent a notification for this document
        const existing = await prisma.notification.findFirst({
          where: {
            tenantId: doc.tenantId,
            type: "contract_expiring",
            data: { path: ["documentId"], equals: doc.id },
            createdAt: { gte: addDays(today, -1) },
          },
        });

        if (!existing) {
          await prisma.$transaction([
            prisma.document.update({
              where: { id: doc.id },
              data: { status: "expiring" },
            }),
            prisma.docHistory.create({
              data: {
                documentId: doc.id,
                action: "status_changed",
                details: { from: "active", to: "expiring", automated: true },
                createdBy: "system",
              },
            }),
          ]);
          expiringCount++;

          try {
            const { sendNotification } = await import("@/lib/notification-service");
            await sendNotification({
              tenantId: doc.tenantId,
              type: "contract_expiring",
              title: `Contrato por vencer: ${doc.title}`,
              message: `Vence el ${format(expDate, "dd/MM/yyyy")}. Quedan ${daysRemaining} días.`,
              data: { documentId: doc.id },
              link: `/opai/documentos/${doc.id}`,
            });
          } catch (e) {
            console.warn("DocAlert: failed to send expiring notification", e);
          }
        }
      }
    }

    // 2. Find documents that have expired
    const expiredDocs = await prisma.document.findMany({
      where: {
        status: { in: ["active", "expiring"] },
        expirationDate: { lte: today },
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        status: true,
        expirationDate: true,
      },
    });

    for (const doc of expiredDocs) {
      await prisma.$transaction([
        prisma.document.update({
          where: { id: doc.id },
          data: { status: "expired" },
        }),
        prisma.docHistory.create({
          data: {
            documentId: doc.id,
            action: "status_changed",
            details: { from: doc.status, to: "expired", automated: true },
            createdBy: "system",
          },
        }),
      ]);
      expiredCount++;

      try {
        const { sendNotification } = await import("@/lib/notification-service");
        await sendNotification({
          tenantId: doc.tenantId,
          type: "contract_expired",
          title: `Contrato vencido: ${doc.title}`,
          message: `Este contrato ha expirado y requiere renovación.`,
          data: { documentId: doc.id },
          link: `/opai/documentos/${doc.id}`,
        });
      } catch (e) {
        console.warn("DocAlert: failed to send expired notification", e);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        checked: activeDocuments.length + expiredDocs.length,
        expiringNotified: expiringCount,
        expiredNotified: expiredCount,
        emailsSent,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in document alerts cron:", error);
    return NextResponse.json(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
}
