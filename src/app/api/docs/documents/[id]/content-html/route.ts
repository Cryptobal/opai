/**
 * GET - Devuelve el contenido del documento como HTML resuelto.
 * Cuando está firmado, incluye las firmas reales (imagen/nombre escrito).
 * Requiere autenticación.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";
import { resolveSignatureTokensInContent } from "@/lib/docs/resolve-signature-tokens";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        signatureRequests: {
          where: { status: "completed" },
          orderBy: { completedAt: "desc" },
          take: 1,
          include: {
            recipients: {
              where: { role: "signer", status: "signed" },
              orderBy: [{ signingOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    let baseContent = await resolveDocumentContentForDisplay({
      tenantId: document.tenantId,
      documentId: document.id,
      document: {
        content: document.content,
        templateId: document.templateId,
        module: document.module,
      },
    });

    const request_ = document.signatureRequests[0];
    if (request_?.recipients?.length) {
      const signers = request_.recipients.map((r) => ({
        name: r.name,
        signingOrder: r.signingOrder,
        signedAt: r.signedAt,
        signatureMethod: r.signatureMethod,
        signatureImageUrl: r.signatureImageUrl,
        signatureTypedName: r.signatureTypedName,
        signatureFontFamily: r.signatureFontFamily,
      }));

      let repLegalFirma: string | null = null;
      const [firmaSetting, autoSetting] = await Promise.all([
        prisma.setting.findFirst({
          where: {
            tenantId: document.tenantId,
            key: { in: [`empresa:${document.tenantId}:empresa.repLegalFirma`, "empresa.repLegalFirma"] },
          },
        }),
        prisma.setting.findFirst({
          where: {
            tenantId: document.tenantId,
            key: { in: [`empresa:${document.tenantId}:empresa.autoFirmaRepLegalContratos`, "empresa.autoFirmaRepLegalContratos"] },
          },
        }),
      ]);
      const autoFirma = autoSetting?.value === "true";
      repLegalFirma = autoFirma ? (firmaSetting?.value ?? null) : null;

      baseContent = resolveSignatureTokensInContent(JSON.parse(JSON.stringify(baseContent)), {
        sentAt: request_.createdAt ?? null,
        signers,
        repLegalFirma,
      }) as typeof baseContent;
    }

    const docForHtml =
      baseContent && typeof baseContent === "object" && !Array.isArray(baseContent) && "content" in baseContent
        ? baseContent
        : Array.isArray(baseContent)
          ? { type: "doc", content: baseContent }
          : { type: "doc", content: [] };

    const documentHtml = tiptapToPreviewHtml(docForHtml);

    return new NextResponse(documentHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error fetching document content HTML:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener contenido" },
      { status: 500 }
    );
  }
}
