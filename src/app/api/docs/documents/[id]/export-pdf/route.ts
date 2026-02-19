/**
 * API Route: /api/docs/documents/[id]/export-pdf
 * GET - Genera PDF del documento (borrador o firmado).
 * Para borradores: exporta el contenido con tokens resueltos.
 * Para firmados: redirige al signed-pdf existente.
 */

import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function esc(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildDraftPdfHtml(title: string, documentHtml: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)} — Borrador</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Georgia, serif; color:#0f172a; font-size:12pt; line-height:1.6; }
    .page { padding:24mm 20mm; }
    .header { border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:20px; }
    .header h1 { font-size:18px; font-weight:700; }
    .header .meta { font-size:11px; color:#64748b; margin-top:4px; }
    .content { font-family: Georgia, serif; }
    .content p { margin:0 0 8px; }
    .content h1, .content h2, .content h3 { margin:12px 0 8px; }
    .content ul, .content ol { margin:0 0 8px; padding-left:24px; }
    .content table { border-collapse:collapse; width:100%; margin:12px 0; }
    .content th, .content td { border:1px solid #e2e8f0; padding:8px 12px; text-align:left; }
    .content th { background:#f1f5f9; font-weight:600; }
    .page-break { page-break-before:always; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>${esc(title)}</h1>
      <div class="meta">Borrador · ${new Date().toLocaleDateString("es-CL")}</div>
    </div>
    <div class="content">
      ${documentHtml}
    </div>
  </div>
</body>
</html>`;
}

export async function GET(
  request: NextRequest,
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
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    // Si está firmado, usar signed-pdf
    const hasCompletedSignature = await prisma.docSignatureRequest.findFirst({
      where: { documentId: id, status: "completed" },
    });
    if (hasCompletedSignature) {
      const baseUrl = request.nextUrl.origin;
      return NextResponse.redirect(`${baseUrl}/api/docs/documents/${id}/signed-pdf`);
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
    const html = buildDraftPdfHtml(document.title, documentHtml);

    let browser;
    if (process.env.NODE_ENV === "development") {
      browser = await chromium.launch({ headless: true });
    } else {
      const executablePath = await chromiumPkg.executablePath();
      browser = await chromium.launch({ args: chromiumPkg.args, executablePath, headless: true });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    await browser.close();

    const fileName = `${document.title.replace(/[^a-zA-Z0-9-_]/g, "_")}-borrador.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating draft PDF:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar PDF" },
      { status: 500 }
    );
  }
}
