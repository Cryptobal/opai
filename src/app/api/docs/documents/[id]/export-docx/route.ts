/**
 * API Route: /api/docs/documents/[id]/export-docx
 * GET - Genera un .docx (Word) del documento borrador con tokens resueltos.
 * Para documentos firmados devuelve 409: la fuente de verdad es el PDF firmado.
 */

import { NextRequest, NextResponse } from "next/server";
// @ts-expect-error - html-to-docx no exporta tipos oficiales
import HTMLtoDOCX from "html-to-docx";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

function esc(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildDocxHtml(title: string, documentHtml: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
</head>
<body>
  ${documentHtml}
</body>
</html>`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 }
      );
    }

    const hasCompletedSignature = await prisma.docSignatureRequest.findFirst({
      where: { documentId: id, status: "completed" },
    });
    if (hasCompletedSignature) {
      return NextResponse.json(
        {
          success: false,
          error: "Los documentos firmados solo se descargan como PDF",
        },
        { status: 409 }
      );
    }

    const docForHtml = await resolveDocumentContentForDisplay({
      tenantId: ctx.tenantId,
      documentId: id,
      document: {
        content: document.content,
        templateId: document.templateId,
        module: document.module,
      },
    });

    const documentHtml = tiptapToPreviewHtml(docForHtml);
    const html = buildDocxHtml(document.title, documentHtml);

    const buffer = (await HTMLtoDOCX(html, undefined, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    })) as Buffer;

    const fileName = `${document.title.replace(/[^a-zA-Z0-9-_]/g, "_")}-borrador.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating draft DOCX:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar Word" },
      { status: 500 }
    );
  }
}
