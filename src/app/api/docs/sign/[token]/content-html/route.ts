/**
 * API Route: /api/docs/sign/[token]/content-html
 * GET - Devuelve el contenido del documento como HTML para mostrar en la página de firma.
 * Usa el mismo flujo que export-pdf para garantizar consistencia.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const recipient = await prisma.docSignatureRecipient.findUnique({
      where: { token },
      include: {
        request: {
          include: {
            document: {
              select: { id: true, title: true, content: true, templateId: true, module: true, tenantId: true },
            },
            recipients: { orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }] },
          },
        },
      },
    });

    if (!recipient) {
      return NextResponse.json({ success: false, error: "Token inválido o expirado" }, { status: 404 });
    }

    if (recipient.request.status === "cancelled" || recipient.request.status === "expired") {
      return NextResponse.json({ success: false, error: "La solicitud ya no está activa" }, { status: 410 });
    }

    const doc = recipient.request.document;
    if (!doc) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const sentAt = recipient.sentAt ?? recipient.request.createdAt;
    const signedAt = recipient.signedAt ?? null;
    const signers = recipient.request.recipients
      .filter((r) => r.role === "signer")
      .map((r) => ({
        id: r.id,
        name: r.name,
        signingOrder: r.signingOrder,
        status: r.status,
        signedAt: r.signedAt,
      }));

    const resolvedContent = await resolveDocumentContentForDisplay({
      tenantId: doc.tenantId,
      documentId: doc.id,
      document: {
        content: doc.content,
        templateId: doc.templateId,
        module: doc.module,
      },
      signatureContext: {
        recipientId: recipient.id,
        signers,
        sentAt,
        signedAt,
      },
    });

    const documentHtml = tiptapToPreviewHtml(resolvedContent);

    return new NextResponse(documentHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error fetching sign content HTML:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener contenido" },
      { status: 500 }
    );
  }
}
