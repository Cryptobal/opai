/**
 * API Route: /api/docs/documents/[id]/signed-pdf
 * GET - Genera PDF profesional del documento con firmas embebidas + certificado de completitud + QR
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resolveDocumentContentForDisplay } from "@/lib/docs/resolve-document-content";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Helpers ── */

function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-CL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── TipTap JSON → HTML ── */

function tiptapNodeToHtml(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return esc(node);
  if (Array.isArray(node)) return node.map(tiptapNodeToHtml).join("");

  if (node.type === "text") {
    let text = esc(node.text ?? "");
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold": text = `<strong>${text}</strong>`; break;
        case "italic": text = `<em>${text}</em>`; break;
        case "underline": text = `<u>${text}</u>`; break;
        case "strike": text = `<s>${text}</s>`; break;
        case "code": text = `<code>${text}</code>`; break;
        case "link": text = `<a href="${esc(mark.attrs?.href || "#")}" style="color:#0059A3;text-decoration:underline">${text}</a>`; break;
        case "textStyle": {
          const styles: string[] = [];
          if (mark.attrs?.color) styles.push(`color:${mark.attrs.color}`);
          if (mark.attrs?.fontFamily) styles.push(`font-family:'${esc(mark.attrs.fontFamily)}',cursive`);
          if (styles.length) text = `<span style="${styles.join(";")}">${text}</span>`;
          break;
        }
        case "highlight":
          text = `<mark style="background:${mark.attrs?.color || '#fef08a'};padding:1px 2px;border-radius:2px">${text}</mark>`;
          break;
      }
    }
    return text;
  }

  // Signature tokens → render as signature block or text
  if (node.type === "contractToken" && node.attrs?.tokenKey) {
    return ""; // We resolve these before calling tiptapNodeToHtml
  }

  if (node.type === "image" && node.attrs?.src) {
    return `<img src="${esc(node.attrs.src)}" alt="${esc(node.attrs.alt || "Firma")}" style="max-height:80px;max-width:240px;object-fit:contain;vertical-align:middle"/>`;
  }

  const children = (node.content ?? []).map(tiptapNodeToHtml).join("");

  switch (node.type) {
    case "doc": return tiptapDocToHtmlWithPageBreaks(node);
    case "paragraph": {
      const align = node.attrs?.textAlign;
      const style = align && align !== "left" ? ` style="text-align:${align}"` : "";
      return `<p${style}>${children || "&nbsp;"}</p>`;
    }
    case "heading": {
      const level = node.attrs?.level ?? 2;
      const align = node.attrs?.textAlign;
      const style = align && align !== "left" ? ` style="text-align:${align}"` : "";
      return `<h${level}${style}>${children}</h${level}>`;
    }
    case "bulletList": return `<ul>${children}</ul>`;
    case "orderedList": return `<ol>${children}</ol>`;
    case "listItem": return `<li>${children}</li>`;
    case "blockquote": return `<blockquote>${children}</blockquote>`;
    case "codeBlock": return `<pre><code>${children}</code></pre>`;
    case "horizontalRule": return `<hr/>`;
    case "pageBreak": return ""; // handled in tiptapDocToHtmlWithPageBreaks
    case "hardBreak": return `<br/>`;
    case "table": return `<table>${children}</table>`;
    case "tableRow": return `<tr>${children}</tr>`;
    case "tableHeader": return `<th>${children}</th>`;
    case "tableCell": return `<td>${children}</td>`;
    case "columns": return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin:1em 0">${children}</div>`;
    case "column": return `<div style="overflow:hidden">${children}</div>`;
    default: return children;
  }
}

/** Procesa el doc dividiendo por pageBreak y envolviendo cada página en un div con page-break-before (Playwright requiere contenido en el elemento) */
function tiptapDocToHtmlWithPageBreaks(doc: any): string {
  const nodes = Array.isArray(doc) ? doc : (doc?.content ?? []);
  const pages: string[] = [];
  let currentPageNodes: any[] = [];

  for (const node of nodes) {
    if (node.type === "pageBreak") {
      if (currentPageNodes.length > 0) {
        pages.push(currentPageNodes.map((n) => tiptapNodeToHtml(n)).join(""));
        currentPageNodes = [];
      }
      pages.push("__PAGE_BREAK__");
    } else {
      currentPageNodes.push(node);
    }
  }
  if (currentPageNodes.length > 0) {
    pages.push(currentPageNodes.map((n) => tiptapNodeToHtml(n)).join(""));
  }

  let html = "";
  let needBreakBefore = false;
  for (const p of pages) {
    if (p === "__PAGE_BREAK__") {
      needBreakBefore = true;
      continue;
    }
    if (needBreakBefore) {
      html += `<div style="page-break-before:always;break-before:page;display:block">${p}</div>`;
      needBreakBefore = false;
    } else {
      html += p;
    }
  }
  return html;
}

/* ── Resolve signature tokens in TipTap JSON ── */

type SignerData = {
  name: string;
  email: string;
  rut: string | null;
  signingOrder: number;
  signedAt: Date | null;
  signatureMethod: string | null;
  signatureImageUrl: string | null;
  signatureTypedName: string | null;
  signatureFontFamily: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type ResolveTokensCtx = {
  sentAt: Date | null;
  signers: SignerData[];
  repLegalFirma?: string | null;
};

function resolveTokens(content: unknown, ctx: ResolveTokensCtx): unknown {
  if (!content || typeof content !== "object") return content;
  if (Array.isArray(content)) return content.map((c) => resolveTokens(c, ctx));
  const node = content as { type?: string; attrs?: { tokenKey?: string }; content?: unknown[] };
  if (node.type === "contractToken" && node.attrs?.tokenKey) {
    const key = node.attrs.tokenKey;
    if (key === "signature.sentDate") return { type: "text", text: fmtDate(ctx.sentAt) };
    if (key === "signature.signedDate") {
      const last = ctx.signers.reduce((p, s) => (!p || (s.signedAt && (!p.signedAt || s.signedAt > p.signedAt)) ? s : p), null as SignerData | null);
      return { type: "text", text: fmtDate(last?.signedAt ?? null) };
    }
    if (key === "empresa.firmaRepLegal" && ctx.repLegalFirma && (ctx.repLegalFirma.startsWith("data:image") || ctx.repLegalFirma.startsWith("http"))) {
      return { type: "image", attrs: { src: ctx.repLegalFirma, alt: "Firma representante legal" } };
    }
    const effectiveKey = key === "signature.firmaGuardia" ? "signature.signer_1" : key === "signature.placeholder" ? "signature.signer_1" : key;
    const m = /^signature\.signer_(\d+)$/.exec(effectiveKey);
    if (m) {
      const order = parseInt(m[1], 10);
      const signer = ctx.signers.find((s) => s.signingOrder === order);
      if (!signer) return { type: "text", text: "" };
      // Firma escrita (nombre estilizado)
      if (signer.signatureMethod === "typed") {
        return { type: "text", text: `${signer.signatureTypedName || signer.name}`, marks: [{ type: "textStyle", attrs: { fontFamily: signer.signatureFontFamily || "cursive" } }] };
      }
      // Firma dibujada o imagen subida: renderizar imagen
      if (signer.signatureImageUrl && (signer.signatureImageUrl.startsWith("data:") || signer.signatureImageUrl.startsWith("http"))) {
        return { type: "image", attrs: { src: signer.signatureImageUrl, alt: `Firma de ${signer.name}` } };
      }
      return { type: "text", text: `[Firmado por ${signer.name}]` };
    }
  }
  if (node.content && Array.isArray(node.content)) {
    return { ...node, content: node.content.map((c) => resolveTokens(c, ctx)) };
  }
  return content;
}

/* ── Build full HTML for PDF ── */

function buildPdfHtml(input: {
  title: string;
  documentHtml: string;
  signedAt: string;
  signers: SignerData[];
  contentHash: string;
  qrDataUrl: string;
  verificationUrl: string;
}) {
  const signersHtml = input.signers.map((s) => {
    let sigBlock = "";
    if (s.signatureMethod === "typed") {
      const font = esc(s.signatureFontFamily || "cursive");
      sigBlock = `<div style="font-family:'${font}',cursive;font-size:32px;line-height:1.1;color:#0f172a;padding:8px 0">${esc(s.signatureTypedName || s.name)}</div>`;
    } else if (s.signatureImageUrl) {
      sigBlock = `<img src="${s.signatureImageUrl}" alt="Firma" style="max-height:80px;max-width:240px;object-fit:contain;padding:8px 0"/>`;
    } else {
      sigBlock = `<div style="font-style:italic;color:#94a3b8;padding:8px 0">Firma no disponible</div>`;
    }
    return `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px;background:#fafbfc">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <div style="font-size:14px;font-weight:700;color:#0f172a">${esc(s.name)}</div>
          <div style="font-size:12px;color:#64748b">${esc(s.email)}${s.rut ? ` · RUT: ${esc(s.rut)}` : ""}</div>
        </div>
        <div style="font-size:11px;color:#64748b;text-align:right">
          ${fmtDate(s.signedAt)}<br/>
          ${s.signatureMethod === "typed" ? "Nombre escrito" : s.signatureMethod === "drawn" ? "Firma dibujada" : "Imagen subida"}
        </div>
      </div>
      ${sigBlock}
    </div>`;
  }).join("");

  const certRows = input.signers.map((s) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">
        <strong>${esc(s.name)}</strong><br/>
        <span style="color:#64748b">${esc(s.email)}${s.rut ? ` · RUT: ${esc(s.rut)}` : ""}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#334155">
        ${fmtDate(s.signedAt)}<br/>
        <span style="color:#64748b;font-size:11px">${s.signatureMethod === "typed" ? "Nombre escrito" : s.signatureMethod === "drawn" ? "Firma dibujada" : "Imagen subida"}</span>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:11px;word-break:break-all">
        ${s.ipAddress ? esc(s.ipAddress) : "—"}
      </td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>${esc(input.title)} — Documento firmado</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Pacifico&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',Arial,sans-serif; color:#0f172a; font-size:13px; line-height:1.6; }
    .page { padding:32px 36px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:16px; margin-bottom:24px; }
    .header h1 { font-size:22px; font-weight:700; }
    .header .meta { font-size:11px; color:#64748b; text-align:right; }
    .badge { display:inline-flex; align-items:center; gap:4px; background:#dcfce7; color:#166534; font-size:11px; font-weight:600; padding:3px 10px; border-radius:20px; }
    .badge::before { content:"✓"; font-weight:700; }
    .doc-content { margin-bottom:28px; }
    .doc-content p { margin:0 0 10px; }
    .doc-content h1 { font-size:20px; margin:20px 0 8px; }
    .doc-content h2 { font-size:17px; margin:18px 0 6px; }
    .doc-content h3 { font-size:15px; margin:14px 0 4px; }
    .doc-content h4 { font-size:14px; margin:12px 0 4px; }
    .doc-content ul, .doc-content ol { margin:0 0 12px 20px; }
    .doc-content li { margin:0 0 4px; }
    .doc-content blockquote { border-left:3px solid #cbd5e1; padding-left:12px; color:#475569; margin:12px 0; }
    .doc-content table { width:100%; border-collapse:collapse; margin:12px 0; }
    .doc-content td, .doc-content th { border:1px solid #e2e8f0; padding:6px 10px; font-size:12px; }
    .doc-content th { background:#f1f5f9; font-weight:600; }
    .doc-content hr { border:none; border-top:1px solid #e2e8f0; margin:16px 0; }
    .section-title { font-size:15px; font-weight:700; margin:24px 0 12px; color:#0f172a; }
    /* Certificate page */
    .cert-page { page-break-before:always; padding:32px 36px; }
    .cert-header { text-align:center; border-bottom:2px solid #0f172a; padding-bottom:16px; margin-bottom:20px; }
    .cert-header h2 { font-size:18px; font-weight:700; }
    .cert-header p { font-size:12px; color:#64748b; margin-top:4px; }
    .cert-table { width:100%; border-collapse:collapse; font-size:12px; margin:16px 0; }
    .cert-table th { background:#f8fafc; text-align:left; padding:8px 10px; border-bottom:2px solid #e2e8f0; font-size:11px; text-transform:uppercase; color:#64748b; letter-spacing:0.5px; }
    .cert-table td { font-size:12px; }
    .cert-footer { margin-top:24px; display:flex; gap:20px; align-items:flex-start; }
    .cert-qr { flex-shrink:0; }
    .cert-info { flex:1; font-size:11px; color:#64748b; }
    .cert-info .hash { word-break:break-all; font-family:monospace; background:#f8fafc; padding:6px 8px; border-radius:6px; margin-top:6px; font-size:10px; color:#334155; border:1px solid #e2e8f0; }
    .cert-legal { margin-top:16px; font-size:10px; color:#94a3b8; line-height:1.5; border-top:1px solid #e2e8f0; padding-top:12px; }
    .foot { text-align:center; font-size:10px; color:#94a3b8; margin-top:20px; }
    @media print {
      div[style*="page-break-before:always"] { page-break-before: always !important; }
      div[style*="break-before:page"] { break-before: page !important; }
    }
  </style>
</head>
<body>
  <!-- Page 1: Document + Signatures -->
  <div class="page">
    <div class="header">
      <div>
        <h1>${esc(input.title)}</h1>
        <div style="margin-top:4px"><span class="badge">Firmado electrónicamente</span></div>
      </div>
      <div class="meta">
        Cierre de firma<br/>
        <strong>${esc(input.signedAt)}</strong>
      </div>
    </div>
    <div class="doc-content">${input.documentHtml}</div>
    <div class="section-title">Firmas</div>
    ${signersHtml}
  </div>

  <!-- Page 2: Certificate of Completion -->
  <div class="cert-page">
    <div class="cert-header">
      <h2>Certificado de firma electrónica</h2>
      <p>Documento: ${esc(input.title)} · Completado: ${esc(input.signedAt)}</p>
    </div>
    <p style="font-size:12px;color:#334155;margin-bottom:16px">
      Este documento fue firmado electrónicamente conforme a la Ley 19.799 de Chile.
      Las firmas fueron registradas con fecha, método de firma, dirección IP e identificación de cada firmante.
    </p>
    <table class="cert-table">
      <thead>
        <tr>
          <th style="width:40%">Firmante</th>
          <th style="width:30%">Fecha y método</th>
          <th style="width:30%">Dirección IP</th>
        </tr>
      </thead>
      <tbody>${certRows}</tbody>
    </table>
    <div class="cert-footer">
      <div class="cert-qr">
        <img src="${input.qrDataUrl}" width="120" height="120" alt="QR" style="border:1px solid #e2e8f0;border-radius:8px"/>
        <div style="text-align:center;font-size:10px;color:#64748b;margin-top:4px">Escanea para verificar</div>
      </div>
      <div class="cert-info">
        <strong style="color:#0f172a">Verificación del documento</strong><br/>
        Escanea el código QR o visita el enlace para verificar la autenticidad de este documento y ver las firmas originales.
        <div class="hash"><strong>SHA-256:</strong> ${input.contentHash}</div>
        <div style="margin-top:6px;word-break:break-all">
          <strong>URL:</strong> <a href="${esc(input.verificationUrl)}" style="color:#0059A3">${esc(input.verificationUrl)}</a>
        </div>
      </div>
    </div>
    <div class="cert-legal">
      La Ley 19.799 (Chile) establece que los actos y contratos suscritos mediante firma electrónica simple son válidos de la misma manera y producen los mismos efectos que los celebrados por escrito y en soporte de papel (Art. 3°). Este certificado registra la evidencia de las firmas, incluyendo identificación del firmante, fecha y hora, método de firma y dirección IP, constituyendo un registro de auditoría completo.
    </div>
    <div class="foot">Generado automáticamente por OPAI · ${new Date().toLocaleDateString("es-CL")}</div>
  </div>
</body>
</html>`;
}

/* ── Route ── */

const signedPdfInclude = {
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewToken = request.nextUrl.searchParams.get("viewToken");

    let document = viewToken
      ? await prisma.document.findFirst({ where: { id, signedViewToken: viewToken }, include: signedPdfInclude })
      : null;

    if (!document) {
      const ctx = await requireAuth();
      if (!ctx) return unauthorized();
      document = await prisma.document.findFirst({ where: { id, tenantId: ctx.tenantId }, include: signedPdfInclude });
    }

    if (!document) {
      return NextResponse.json({ success: false, error: "Documento no encontrado" }, { status: 404 });
    }

    const completedRequest = document.signatureRequests[0];
    if (!completedRequest) {
      return NextResponse.json({ success: false, error: "Documento sin firma completada" }, { status: 400 });
    }

    const signers: SignerData[] = completedRequest.recipients.map((r) => ({
      name: r.name,
      email: r.email,
      rut: r.rut,
      signingOrder: r.signingOrder,
      signedAt: r.signedAt,
      signatureMethod: r.signatureMethod,
      signatureImageUrl: r.signatureImageUrl,
      signatureTypedName: r.signatureTypedName,
      signatureFontFamily: r.signatureFontFamily,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
    }));

    const sentAt = completedRequest.createdAt ?? null;

    // Cargar firma rep legal para token empresa.firmaRepLegal (solo si auto-firma está activa)
    let repLegalFirma: string | null = null;
    const tenantId = document.tenantId;
    if (tenantId) {
      const [firmaSetting, autoSetting] = await Promise.all([
        prisma.setting.findFirst({
          where: {
            tenantId,
            key: { in: [`empresa:${tenantId}:empresa.repLegalFirma`, "empresa.repLegalFirma"] },
          },
        }),
        prisma.setting.findFirst({
          where: {
            tenantId,
            key: { in: [`empresa:${tenantId}:empresa.autoFirmaRepLegalContratos`, "empresa.autoFirmaRepLegalContratos"] },
          },
        }),
      ]);
      const autoFirma = autoSetting?.value === "true";
      repLegalFirma = autoFirma ? (firmaSetting?.value ?? null) : null;
    }

    // Usar plantilla + datos actuales del guardia (contractStartDate, etc.)
    const baseContent = await resolveDocumentContentForDisplay({
      tenantId: document.tenantId,
      documentId: document.id,
      document: {
        content: document.content,
        templateId: document.templateId,
        module: document.module,
      },
    });
    const resolvedContent = resolveTokens(JSON.parse(JSON.stringify(baseContent)), { sentAt, signers, repLegalFirma });
    // Asegurar estructura doc: si es array, envolver en doc
    const docForHtml =
      resolvedContent && typeof resolvedContent === "object" && !Array.isArray(resolvedContent) && "content" in resolvedContent
        ? resolvedContent
        : Array.isArray(resolvedContent)
          ? { type: "doc", content: resolvedContent }
          : { type: "doc", content: [] };
    const documentHtml = tiptapNodeToHtml(docForHtml);
    const signedAt = fmtDate(completedRequest.completedAt ?? document.signedAt ?? new Date());
    const contentHash = createHash("sha256").update(JSON.stringify(resolvedContent)).digest("hex");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://opai.gard.cl";
    const verificationUrl = document.signedViewToken
      ? `${siteUrl}/signed/${document.id}/${document.signedViewToken}`
      : `${siteUrl}/opai/documentos/${document.id}`;

    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 200, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } });

    const html = buildPdfHtml({
      title: document.title,
      documentHtml,
      signedAt,
      signers,
      contentHash,
      qrDataUrl,
      verificationUrl,
    });

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

    await prisma.document.update({ where: { id: document.id }, data: { pdfGeneratedAt: new Date() } });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.title.replace(/[^a-zA-Z0-9-_]/g, "_")}-firmado.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating signed PDF:", error);
    return NextResponse.json({ success: false, error: "Error al generar PDF firmado" }, { status: 500 });
  }
}
