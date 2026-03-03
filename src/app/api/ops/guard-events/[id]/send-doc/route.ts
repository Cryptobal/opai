import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { resend, getTenantEmailConfig } from "@/lib/resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ops/guard-events/[id]/send-doc — Send document by email as PDF
 * Body: { documentId: string, ccEmails?: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    if (!body.documentId) {
      return NextResponse.json(
        { success: false, error: "documentId es requerido" },
        { status: 400 },
      );
    }

    // 1. Load guard event
    const event = await prisma.opsGuardEvent.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 },
      );
    }

    // 2. Load guard + persona for email
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: event.guardiaId, tenantId: ctx.tenantId },
      include: { persona: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!guardia?.persona?.email) {
      return NextResponse.json(
        { success: false, error: "El guardia no tiene email registrado" },
        { status: 400 },
      );
    }

    // 3. Load document
    const document = await prisma.document.findFirst({
      where: { id: body.documentId, tenantId: ctx.tenantId },
    });
    if (!document) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 },
      );
    }

    // 4. Convert Tiptap JSON content to HTML
    const htmlContent = tiptapToHtml(document.content);

    // 5. Generate PDF with Playwright
    const pdfBuffer = await generatePdfFromHtml(htmlContent, document.title);

    // 6. Send email with Resend
    const emailConfig = await getTenantEmailConfig(ctx.tenantId);
    const guardName = `${guardia.persona.firstName} ${guardia.persona.lastName}`;

    const toEmails = [guardia.persona.email];
    const ccEmails = body.ccEmails?.filter((e: string) => e) ?? [];

    await resend.emails.send({
      from: emailConfig.from,
      replyTo: emailConfig.replyTo,
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: document.title,
      html: `
        <p>Estimado/a ${guardName},</p>
        <p>Se adjunta el documento: <strong>${document.title}</strong>.</p>
        <p>Saludos cordiales.</p>
      `,
      attachments: [
        {
          filename: `${document.title.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s-]/g, "").trim()}.pdf`,
          content: Buffer.from(pdfBuffer),
        },
      ],
    });

    // 7. Log in DocHistory
    await prisma.docHistory.create({
      data: {
        documentId: document.id,
        action: "sent",
        userId: ctx.userId,
        details: {
          to: toEmails,
          cc: ccEmails,
          sentAt: new Date().toISOString(),
          guardEventId: id,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error sending document for guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo enviar el documento" },
      { status: 500 },
    );
  }
}

function tiptapToHtml(content: any): string {
  if (!content) return "<p>Documento vacío</p>";

  if (typeof content === "string") {
    try {
      content = JSON.parse(content);
    } catch {
      return content;
    }
  }

  function renderNode(node: any): string {
    if (!node) return "";
    if (node.type === "text") {
      let text = node.text ?? "";
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === "bold") text = `<strong>${text}</strong>`;
          if (mark.type === "italic") text = `<em>${text}</em>`;
          if (mark.type === "underline") text = `<u>${text}</u>`;
        }
      }
      return text;
    }

    const children = (node.content ?? []).map(renderNode).join("");

    switch (node.type) {
      case "doc": return children;
      case "paragraph": return `<p>${children || "&nbsp;"}</p>`;
      case "heading": {
        const level = node.attrs?.level ?? 2;
        return `<h${level}>${children}</h${level}>`;
      }
      case "bulletList": return `<ul>${children}</ul>`;
      case "orderedList": return `<ol>${children}</ol>`;
      case "listItem": return `<li>${children}</li>`;
      case "blockquote": return `<blockquote>${children}</blockquote>`;
      case "horizontalRule": return "<hr/>";
      case "hardBreak": return "<br/>";
      case "table": return `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">${children}</table>`;
      case "tableRow": return `<tr>${children}</tr>`;
      case "tableHeader": return `<th style="background:#f0f0f0;font-weight:bold">${children}</th>`;
      case "tableCell": return `<td>${children}</td>`;
      default: return children;
    }
  }

  return renderNode(content);
}

async function generatePdfFromHtml(html: string, title: string): Promise<Uint8Array> {
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; padding: 40px; color: #333; }
    h1 { font-size: 18pt; margin-bottom: 12pt; }
    h2 { font-size: 15pt; margin-bottom: 10pt; }
    h3 { font-size: 13pt; margin-bottom: 8pt; }
    p { margin: 0 0 8pt 0; }
    table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background-color: #f5f5f5; font-weight: bold; }
    ul, ol { margin: 0 0 8pt 24pt; }
    blockquote { border-left: 3px solid #ccc; padding-left: 12pt; margin: 8pt 0; color: #555; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

  const isDev = process.env.NODE_ENV === "development";
  const executablePath = isDev ? undefined : await chromiumPkg.executablePath();

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: isDev ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromiumPkg.args,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
