/**
 * API Route: /api/cron/signature-reminders
 * GET - Expira solicitudes vencidas y envía recordatorios de firma
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSignatureReminderEmail } from "@/lib/docs-signature-email";

const REMINDER_INTERVAL_HOURS = 24;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const reminderCutoff = new Date(now.getTime() - REMINDER_INTERVAL_HOURS * 60 * 60 * 1000);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";

    let expiredRequestsCount = 0;
    let remindersSentCount = 0;

    // 1) Expirar solicitudes vencidas
    const expiredRequests = await prisma.docSignatureRequest.findMany({
      where: {
        status: { in: ["pending", "in_progress"] },
        expiresAt: { lt: now },
      },
      include: {
        recipients: true,
        document: { select: { id: true, title: true } },
      },
    });

    for (const req of expiredRequests) {
      await prisma.$transaction(async (tx) => {
        await tx.docSignatureRequest.update({
          where: { id: req.id },
          data: { status: "expired" },
        });

        await tx.docSignatureRecipient.updateMany({
          where: {
            requestId: req.id,
            status: { in: ["pending", "sent", "viewed"] },
          },
          data: { status: "expired" },
        });

        await tx.document.update({
          where: { id: req.documentId },
          data: { signatureStatus: "expired" },
        });

        await tx.docHistory.create({
          data: {
            documentId: req.documentId,
            action: "signature_request_expired",
            details: {
              requestId: req.id,
              expiresAt: req.expiresAt?.toISOString() ?? null,
              automated: true,
            },
            createdBy: "system",
          },
        });
      });

      expiredRequestsCount += 1;
    }

    // 2) Enviar recordatorios de firma
    const pendingRecipients = await prisma.docSignatureRecipient.findMany({
      where: {
        role: "signer",
        status: { in: ["pending", "sent", "viewed"] },
        request: {
          status: { in: ["pending", "in_progress"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        OR: [{ sentAt: null }, { sentAt: { lte: reminderCutoff } }],
      },
      include: {
        request: {
          include: {
            document: {
              select: {
                title: true,
              },
            },
            recipients: {
              select: {
                role: true,
                signingOrder: true,
                status: true,
              },
            },
          },
        },
      },
    });

    for (const recipient of pendingRecipients) {
      const previousSigners = recipient.request.recipients.filter(
        (r) => r.role === "signer" && r.signingOrder < recipient.signingOrder
      );
      const canSignNow = previousSigners.every((r) => r.status === "signed");
      if (!canSignNow) continue;

      const signingUrl = `${siteUrl}/sign/${recipient.token}`;
      const result = await sendSignatureReminderEmail({
        to: recipient.email,
        recipientName: recipient.name,
        documentTitle: recipient.request.document.title,
        signingUrl,
        expiresAt: recipient.request.expiresAt ? recipient.request.expiresAt.toISOString() : null,
      });

      if (result.ok) {
        await prisma.docSignatureRecipient.update({
          where: { id: recipient.id },
          data: {
            sentAt: new Date(),
            status: recipient.status === "pending" ? "sent" : recipient.status,
          },
        });
        remindersSentCount += 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        expiredRequests: expiredRequestsCount,
        remindersSent: remindersSentCount,
        checkedRecipients: pendingRecipients.length,
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in signature reminders cron:", error);
    return NextResponse.json(
      { success: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
}
