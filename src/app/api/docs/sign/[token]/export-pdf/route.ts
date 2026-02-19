/**
 * API Route: /api/docs/sign/[token]/export-pdf
 * GET - Genera PDF del documento para revisión antes de firmar.
 * Acceso público validado por token de firma.
 * Usa plantilla + datos actuales del guardia (contractStartDate, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import { prisma } from "@/lib/prisma";
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
  <title>${esc(title)} — Para firma</title>
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
      <div class="meta">Documento para firma · ${new Date().toLocaleDateString("es-CL")}</div>
    </div>
    <div class="content">
      ${documentHtml}
    </div>
  </div>
</body>
</html>`;
}

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

    if (recipient.request.expiresAt && recipient.request.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: "La solicitud de firma expiró" }, { status: 410 });
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
    const html = buildDraftPdfHtml(doc.title, documentHtml);

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

    const fileName = `${doc.title.replace(/[^a-zA-Z0-9-_]/g, "_")}-para-firma.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Error generating sign PDF:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar PDF" },
      { status: 500 }
    );
  }
}
