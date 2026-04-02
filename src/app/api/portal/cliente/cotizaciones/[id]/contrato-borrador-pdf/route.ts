import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";
import {
  resolveDocument,
  buildEmpresaEntityData,
  buildQuoteEnrichedData,
  buildContractEntityData,
} from "@/lib/docs/token-resolver";
import type { EntityData } from "@/lib/docs/token-resolver";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";
import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";

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

function buildContractPdfHtml(title: string, contractHtml: string): string {
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
    .watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-35deg);
      font-size:60pt; color:rgba(0,0,0,0.04); font-weight:700; white-space:nowrap; z-index:0; pointer-events:none; }
  </style>
</head>
<body>
  <div class="watermark">BORRADOR</div>
  <div class="page">
    <div class="header">
      <h1>${esc(title)}</h1>
      <div class="meta">Borrador (no vinculante) · ${new Date().toLocaleDateString("es-CL")}</div>
    </div>
    <div class="content">
      ${contractHtml}
    </div>
  </div>
</body>
</html>`;
}

/**
 * GET /api/portal/cliente/cotizaciones/[id]/contrato-borrador-pdf
 *
 * Generates a PDF of the contract draft using the same resolve logic
 * as the JSON endpoint, then renders to PDF with Playwright/Chromium.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id: quoteId } = await params;

    /* ── 1. Quote + access check ── */
    const quote = await prisma.cpqQuote.findFirst({
      where: {
        id: quoteId,
        accountId: session.accountId,
        tenantId: session.tenantId,
        ...cpqQuoteListedInClientPortalWhere(),
      },
      select: {
        id: true, accountId: true, tenantId: true, dealId: true,
        name: true, parameters: { select: { contractMonths: true } },
      },
    });

    if (!quote || !quote.accountId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    /* ── 2. Template ── */
    const template = await prisma.docTemplate.findFirst({
      where: {
        tenantId: session.tenantId,
        module: "crm",
        category: { in: ["contrato_servicio", "contrato_cliente"] },
        isActive: true,
        isDefault: true,
      },
      select: { id: true, name: true, content: true },
    });

    if (!template) {
      return NextResponse.json({ error: "No hay plantilla" }, { status: 404 });
    }

    /* ── 3. Build entity data ── */
    const [account, contact, deal, installation] = await Promise.all([
      prisma.crmAccount.findUnique({
        where: { id: quote.accountId! },
        select: {
          name: true, rut: true, legalName: true,
          legalRepresentativeName: true, legalRepresentativeRut: true,
          address: true, commune: true, industry: true, segment: true,
          size: true, website: true, notaryName: true, notaryDate: true,
        },
      }),
      prisma.crmContact.findFirst({
        where: { accountId: quote.accountId!, tenantId: session.tenantId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { firstName: true, lastName: true, email: true, phone: true, roleTitle: true },
      }),
      quote.dealId
        ? prisma.crmDeal.findUnique({
            where: { id: quote.dealId },
            select: { title: true, amount: true, expectedCloseDate: true, service: true },
          })
        : null,
      prisma.crmInstallation.findFirst({
        where: { accountId: quote.accountId!, status: { in: ["active", "prospect"] } },
        select: { name: true, address: true, commune: true, city: true },
        orderBy: { status: "asc" }, // "active" sorts before "prospect"
      }),
    ]);

    let rawEmpresa = await prisma.setting.findMany({
      where: { tenantId: session.tenantId, key: { startsWith: `empresa:${session.tenantId}:` } },
      select: { key: true, value: true },
    });
    if (rawEmpresa.length === 0) {
      rawEmpresa = await prisma.setting.findMany({
        where: { tenantId: session.tenantId, key: { startsWith: "empresa." } },
        select: { key: true, value: true },
      });
    }
    const empresaSettings = rawEmpresa.map((s) => ({
      key: s.key.includes(":") ? s.key.replace(`empresa:${session.tenantId}:`, "") : s.key,
      value: s.value,
    }));

    const quoteData = await buildQuoteEnrichedData(quoteId);
    if (quoteData.salePriceMonthly && (!quoteData.salePriceUF || quoteData.salePriceUF === "")) {
      try {
        const ufValue = await getUfValue();
        if (ufValue > 0) {
          quoteData.salePriceUF = clpToUf(Number(quoteData.salePriceMonthly), ufValue).toFixed(2);
        }
      } catch { /* UF not available */ }
    }

    const contractMonths = quote.parameters?.contractMonths ?? quoteData.contractMonths ?? null;

    const entities: EntityData = {
      empresa: buildEmpresaEntityData(empresaSettings),
      account: account ?? undefined,
      contact: contact ?? undefined,
      deal: deal ? { ...deal, amount: deal.amount ? Number(deal.amount) : null } : undefined,
      quote: quoteData,
      installation: installation ?? undefined,
      contract: buildContractEntityData({
        title: quote.name ?? undefined,
        durationMonths: contractMonths ? Number(contractMonths) : undefined,
      }),
    };

    /* ── 4. Resolve + HTML ── */
    const content = template.content as { type: string; content: unknown[] };
    const { resolvedContent } = resolveDocument(content, entities);
    const contractHtml = tiptapToPreviewHtml(resolvedContent);
    const fullHtml = buildContractPdfHtml(template.name, contractHtml);

    /* ── 5. Render PDF ── */
    let browser;
    if (process.env.NODE_ENV === "development") {
      browser = await chromium.launch({ headless: true });
    } else {
      const executablePath = await chromiumPkg.executablePath();
      browser = await chromium.launch({
        args: chromiumPkg.args,
        executablePath,
        headless: true,
      });
    }

    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    await browser.close();

    /* ── 6. Log + return ── */
    try {
      await prisma.portalAccessLog.create({
        data: {
          tenantId: session.tenantId,
          portalType: "cliente",
          userType: "contact",
          userId: session.contactId,
          accountId: session.accountId,
          action: "download_contract_draft",
          resource: quoteId,
        },
      });
    } catch (e) {
      console.warn("[Portal] download_contract_draft log:", (e as Error)?.message);
    }

    const fileName = `Borrador-Contrato-${quoteId.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("[Portal] Error generating contract draft PDF:", error);
    return NextResponse.json(
      { error: "Error al generar PDF del borrador" },
      { status: 500 }
    );
  }
}
