import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { uploadFile } from "@/lib/storage";
import { renderVraReportHtml } from "@/lib/vra/renderer-html";
import { ensureVulnerabilityDocType } from "@/lib/vra/seed-tenant-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/vra/reports/[id]/export-pdf
 * Renderiza el HTML, genera PDF con Playwright, sube a R2, crea/actualiza
 * el DocOperacional vinculado y persiste pdfUrl + htmlSnapshot en el report.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const { id } = await params;

    const report = await prisma.vraReport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        installation: { select: { name: true, address: true, city: true } },
        sections: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!report) {
      return NextResponse.json({ success: false, error: "Informe no encontrado" }, { status: 404 });
    }
    if (report.status === "draft") {
      return NextResponse.json(
        { success: false, error: "El informe debe estar generado antes de exportar (status=ready o approved)" },
        { status: 400 },
      );
    }

    // Branding del tenant
    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
    const brand = {
      color: "#1B3A6F",
      goldAccent: "#D4A017",
      companyName: tenant?.name ?? "Gard Security",
    };

    // Render HTML
    const html = renderVraReportHtml(
      {
        id: report.id,
        title: report.title,
        riskLevel: report.riskLevel,
        version: report.version,
        generatedAt: report.generatedAt,
        metadata: report.metadata as Record<string, unknown> | null,
        installation: report.installation,
        sections: report.sections.map((s) => ({
          id: s.id,
          key: s.key,
          title: s.title,
          outputType: s.outputType,
          sortOrder: s.sortOrder,
          contentJson: s.contentJson,
          status: s.status,
        })),
      },
      brand,
    );

    let browser;
    if (process.env.NODE_ENV === "development") {
      browser = await chromium.launch({ headless: true });
    } else {
      const executablePath = await chromiumPkg.executablePath();
      browser = await chromium.launch({ args: chromiumPkg.args, executablePath, headless: true });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
    });
    await browser.close();

    const fileName = `informe-vulnerabilidad-${report.installation.name.replace(/[^a-zA-Z0-9-_]/g, "_")}-v${report.version}.pdf`;
    const upload = await uploadFile(
      Buffer.from(pdfBuffer),
      fileName,
      "application/pdf",
      `vra/${report.id}`,
      ctx.tenantId,
    );

    const tipoDoc = await ensureVulnerabilityDocType(ctx.tenantId);

    let docOperacionalId: string | null = report.docOperacionalId ?? null;
    if (docOperacionalId) {
      await prisma.docOperacional.update({
        where: { id: docOperacionalId },
        data: {
          fileName,
          fileUrl: upload.publicUrl,
          storageKey: upload.storageKey,
          fileSize: pdfBuffer.length,
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: "vigente",
        },
      });
    } else {
      const newDoc = await prisma.docOperacional.create({
        data: {
          tenantId: ctx.tenantId,
          tipoId: tipoDoc.id,
          capa: "instalacion",
          installationId: report.installationId,
          fileName,
          fileUrl: upload.publicUrl,
          storageKey: upload.storageKey,
          fileSize: pdfBuffer.length,
          mimeType: "application/pdf",
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: "vigente",
          notes: `Generado automáticamente por VRA Report ${report.uniqueId}`,
          createdBy: ctx.userId,
          portalClienteVisible: report.portalVisible,
        },
      });
      docOperacionalId = newDoc.id;
    }

    const publicToken =
      report.publicToken ?? `${report.uniqueId}-${Math.random().toString(36).slice(2, 10)}`;

    await prisma.vraReport.update({
      where: { id: report.id },
      data: {
        pdfUrl: upload.publicUrl,
        pdfStorageKey: upload.storageKey,
        htmlSnapshot: html,
        docOperacionalId,
        publicToken: publicToken === report.publicToken ? undefined : publicToken,
      },
    });

    return NextResponse.json({
      success: true,
      pdfUrl: upload.publicUrl,
      docOperacionalId,
      fileName,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[VRA] export-pdf error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
