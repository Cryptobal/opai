/**
 * API Route: /api/portal/cliente/contrato/[token]/docx
 * GET - Genera un .docx (Word) del borrador de contrato para que el cliente
 * lo descargue y revise. Público (keyed por contractClientToken), igual que
 * el GET del contrato. El contenido ya viene resuelto en document.content.
 */

import { NextRequest, NextResponse } from "next/server";
// @ts-expect-error - html-to-docx no exporta tipos oficiales
import HTMLtoDOCX from "html-to-docx";
import { prisma } from "@/lib/prisma";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";
import { buildContentDisposition } from "@/lib/pdf/cpq-quote-pdf-filename";

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
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const document = await prisma.document.findFirst({
      where: { contractClientToken: token },
      select: { id: true, title: true, content: true, tenantId: true },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Contrato no encontrado" },
        { status: 404 }
      );
    }

    const documentHtml = tiptapToPreviewHtml(document.content);
    const html = buildDocxHtml(document.title, documentHtml);

    const buffer = (await HTMLtoDOCX(html, undefined, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    })) as Buffer;

    const fileName = `${document.title.replace(/[^a-zA-Z0-9-_]/g, "_")}-borrador.docx`;

    // Log de acceso (best-effort, no bloquea la descarga)
    try {
      await prisma.portalAccessLog.create({
        data: {
          tenantId: document.tenantId,
          portalType: "cliente",
          userType: "contact",
          // Flujo público por token: no hay sesión/contacto identificado.
          userId: "contract_client",
          action: "download_contract_docx",
          resource: document.id,
        },
      });
    } catch (e) {
      console.warn("[Portal] download_contract_docx log:", (e as Error)?.message);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": buildContentDisposition(fileName, "attachment"),
      },
    });
  } catch (error) {
    console.error("Error generating contract DOCX by token:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar Word" },
      { status: 500 }
    );
  }
}
