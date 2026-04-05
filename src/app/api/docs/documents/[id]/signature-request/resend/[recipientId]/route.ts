/**
 * API Route: /api/docs/documents/[id]/signature-request/resend/[recipientId]
 * POST - Reenviar email de firma a un firmante
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { hasRoleOrHigher, type Role } from "@/lib/rbac";
import { sendSignatureReminderEmail } from "@/lib/docs-signature-email";

function forbidden() {
  return NextResponse.json({ success: false, error: "No autorizado para esta acción" }, { status: 403 });
}

function requireAdminRole(role: string) {
  return hasRoleOrHigher(role as Role, "admin");
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; recipientId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    if (!requireAdminRole(ctx.userRole)) return forbidden();

    const { id, recipientId } = await params;

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const recipient = await prisma.docSignatureRecipient.findFirst({
      where: {
        id: recipientId,
        request: {
          tenantId: ctx.tenantId,
          documentId: id,
          status: { in: ["pending", "in_progress"] },
        },
      },
      include: {
        request: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            document: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    if (!recipient) {
      return NextResponse.json(
        { success: false, error: "Firmante no encontrado para una solicitud activa" },
        { status: 404 }
      );
    }

    if (["signed", "declined", "expired"].includes(recipient.status)) {
      return NextResponse.json(
        { success: false, error: `No se puede reenviar a un firmante en estado ${recipient.status}` },
        { status: 409 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const signingUrl = `${siteUrl}/sign/${recipient.token}`;
    const emailResult = await sendSignatureReminderEmail({
      to: recipient.email,
      recipientName: recipient.name,
      documentTitle: recipient.request.document.title,
      signingUrl,
      expiresAt: recipient.request.expiresAt ? recipient.request.expiresAt.toISOString() : null,
    });

    const updated = await prisma.docSignatureRecipient.update({
      where: { id: recipientId },
      data: {
        sentAt: new Date(),
        status: emailResult.ok && recipient.status === "pending" ? "sent" : recipient.status,
      },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        sentAt: true,
        requestId: true,
      },
    });

    await prisma.docHistory.create({
      data: {
        documentId: id,
        action: "signature_recipient_resent",
        details: {
          requestId: recipient.requestId,
          recipientId: recipient.id,
          email: recipient.email,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      meta: {
        emailSent: emailResult.ok,
        emailError: emailResult.ok ? null : emailResult.error,
      },
    });
  } catch (error) {
    console.error("Error resending signature email:", error);
    return NextResponse.json(
      { success: false, error: "Error al reenviar solicitud de firma" },
      { status: 500 }
    );
  }
}
