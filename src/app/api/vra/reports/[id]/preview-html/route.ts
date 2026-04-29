import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { renderVraReportHtml } from "@/lib/vra/renderer-html";

export const dynamic = "force-dynamic";

/**
 * GET /api/vra/reports/[id]/preview-html
 * Devuelve el HTML del informe sin convertir a PDF (para preview en chat / portal).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
    const brand = {
      color: "#1B3A6F",
      goldAccent: "#D4A017",
      companyName: tenant?.name ?? "Gard Security",
    };

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

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
