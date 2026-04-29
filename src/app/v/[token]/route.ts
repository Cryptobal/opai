import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderVraReportHtml } from "@/lib/vra/renderer-html";

export const dynamic = "force-dynamic";

/**
 * GET /v/[token]
 * Viewer público de informe VRA usando publicToken.
 * Devuelve el HTML del informe directamente (read-only). Solo accesible si
 * portalVisible=true y status válido.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const report = await prisma.vraReport.findUnique({
    where: { publicToken: token },
    include: {
      installation: { select: { name: true, address: true, city: true } },
      sections: { orderBy: { sortOrder: "asc" } },
      tenant: { select: { name: true } },
    },
  });

  if (
    !report ||
    !report.portalVisible ||
    report.status === "draft" ||
    report.status === "archived"
  ) {
    return new NextResponse("Informe no disponible", { status: 404 });
  }

  const brand = {
    color: "#1B3A6F",
    goldAccent: "#D4A017",
    companyName: report.tenant?.name ?? "Gard Security",
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

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
