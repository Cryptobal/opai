import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildAficheA4Pdf, buildStickerPdf } from "@/lib/incidentes-instalacion/senaletica-pdf";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") === "sticker" ? "sticker" : "a4";
  const inst = await prisma.crmInstallation.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      name: true,
      address: true,
      commune: true,
      city: true,
      publicReportEnabled: true,
      publicReportToken: true,
      marcacionCode: true,
    },
  });
  if (!inst || !inst.publicReportEnabled || !inst.publicReportToken) {
    return NextResponse.json(
      { success: false, error: "Habilita el canal de reportes antes de descargar la señalética." },
      { status: 422 },
    );
  }
  const cfg = await getTenantCompanyConfig(ctx.tenantId);
  const tenantName = cfg.commercialName || cfg.companyName || "Seguridad";
  const tenantMonogram = tenantName.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").slice(0, 2).toUpperCase() || "OP";
  const input = {
    publicUrl: `${getCanonicalSiteUrl()}/r/${inst.publicReportToken}`,
    tenantName,
    tenantMonogram,
    installationName: inst.name,
    address: [inst.address, inst.commune, inst.city].filter(Boolean).join(", ") || null,
    installationCode: inst.marcacionCode,
  };
  const buf = format === "sticker" ? await buildStickerPdf(input) : await buildAficheA4Pdf(input);
  const filename = format === "sticker"
    ? `adhesivo-reporte-${inst.name}.pdf`
    : `afiche-reporte-${inst.name}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]+/g, "_")}"`,
    },
  });
}
