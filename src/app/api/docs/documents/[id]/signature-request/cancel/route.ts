/**
 * API Route: /api/docs/documents/[id]/signature-request/cancel
 * POST - Cancelar solicitud de firma activa
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { cancelSignatureRequestSchema } from "@/lib/validations/docs";
import { canDelete } from "@/lib/permissions";

function forbidden() {
  return NextResponse.json({ success: false, error: "No autorizado para esta acción" }, { status: 403 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "docs", "gestion")) return forbidden();

    const { id } = await params;
    const parsed = await parseBody(request, cancelSignatureRequestSchema);
    if (parsed.error) return parsed.error;

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const activeRequest = await prisma.docSignatureRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        documentId: id,
        status: { in: ["pending", "in_progress"] },
      },
      include: {
        recipients: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!activeRequest) {
      return NextResponse.json(
        { success: false, error: "No existe solicitud de firma activa para cancelar" },
        { status: 404 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.docSignatureRequest.update({
        where: { id: activeRequest.id },
        data: { status: "cancelled" },
      });

      await tx.docSignatureRecipient.updateMany({
        where: {
          requestId: activeRequest.id,
          status: { in: ["pending", "sent", "viewed"] },
        },
        data: { status: "expired" },
      });

      await tx.document.update({
        where: { id },
        data: {
          signatureStatus: "cancelled",
        },
      });

      await tx.docHistory.create({
        data: {
          documentId: id,
          action: "signature_request_cancelled",
          details: {
            requestId: activeRequest.id,
            reason: parsed.data.reason ?? null,
          },
          createdBy: ctx.userId,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        requestId: activeRequest.id,
        status: "cancelled",
      },
    });
  } catch (error) {
    console.error("Error cancelling signature request:", error);
    return NextResponse.json(
      { success: false, error: "Error al cancelar solicitud de firma" },
      { status: 500 }
    );
  }
}
