/**
 * GET - Devuelve el contenido del documento firmado como HTML.
 * Usa el mismo flujo que signed-pdf para garantizar que se vea igual.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";
import { resolveSignatureTokensInContent } from "@/lib/docs/resolve-signature-tokens";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";

export const dynamic = "force-dynamic";

const signedViewInclude = {
  signatureRequests: {
    where: { status: "completed" as const },
    include: {
      recipients: {
        where: { role: "signer" as const, status: "signed" as const },
        orderBy: [{ signingOrder: "asc" as const }, { createdAt: "asc" as const }],
      },
    },
    orderBy: { completedAt: "desc" as const },
    take: 1,
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string; viewToken: string }> }
) {
  try {
    const { documentId, viewToken } = await params;
    const doc = await prisma.document.findFirst({
      where: { id: documentId, signedViewToken: viewToken },
      include: signedViewInclude,
    });

    if (!doc) {
      return NextResponse.json({ success: false, error: "Enlace inválido o expirado" }, { status: 404 });
    }

    const request = doc.signatureRequests[0];
    if (!request) {
      return NextResponse.json({ success: false, error: "Documento sin firma completada" }, { status: 400 });
    }

    const signers = request.recipients.map((r) => ({
      name: r.name,
      signingOrder: r.signingOrder,
      signedAt: r.signedAt,
      signatureMethod: r.signatureMethod,
      signatureImageUrl: r.signatureImageUrl,
      signatureTypedName: r.signatureTypedName,
      signatureFontFamily: r.signatureFontFamily,
    }));

    const sentAt = request.createdAt ?? null;

    let repLegalFirma: string | null = null;
    if (doc.tenantId) {
      const [firmaSetting, autoSetting] = await Promise.all([
        prisma.setting.findFirst({
          where: {
            tenantId: doc.tenantId,
            key: { in: [`empresa:${doc.tenantId}:empresa.repLegalFirma`, "empresa.repLegalFirma"] },
          },
        }),
        prisma.setting.findFirst({
          where: {
            tenantId: doc.tenantId,
            key: { in: [`empresa:${doc.tenantId}:empresa.autoFirmaRepLegalContratos`, "empresa.autoFirmaRepLegalContratos"] },
          },
        }),
      ]);
      const autoFirma = autoSetting?.value === "true";
      repLegalFirma = autoFirma ? (firmaSetting?.value ?? null) : null;
    }

    const baseContent = await resolveDocumentContentForDisplay({
      tenantId: doc.tenantId,
      documentId: doc.id,
      document: {
        content: doc.content,
        templateId: doc.templateId,
        module: doc.module,
      },
    });

    const resolvedContent = resolveSignatureTokensInContent(JSON.parse(JSON.stringify(baseContent)), {
      sentAt,
      signers,
      repLegalFirma,
    });

    const docForHtml =
      resolvedContent && typeof resolvedContent === "object" && !Array.isArray(resolvedContent) && "content" in resolvedContent
        ? resolvedContent
        : Array.isArray(resolvedContent)
          ? { type: "doc", content: resolvedContent }
          : { type: "doc", content: [] };

    const documentHtml = tiptapToPreviewHtml(docForHtml);

    return new NextResponse(documentHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error fetching signed view content HTML:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener contenido" },
      { status: 500 }
    );
  }
}
