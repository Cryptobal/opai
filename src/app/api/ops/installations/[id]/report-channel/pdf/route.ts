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
  const qrId = request.nextUrl.searchParams.get("qrId");
  const inst = await prisma.crmInstallation.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      name: true,
      address: true,
      commune: true,
      city: true,
      publicReportEnabled: true,
      marcacionCode: true,
      reportQrs: {
        where: {
          status: "assigned",
          ...(qrId ? { id: qrId } : {}),
        },
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: { token: true, serialLabel: true },
      },
    },
  });
  const qr = inst?.reportQrs[0];
  if (!inst || !inst.publicReportEnabled || !qr) {
    return NextResponse.json(
      { success: false, error: "Asigna un QR y habilita el canal antes de descargar la señalética." },
      { status: 422 },
    );
  }
  const cfg = await getTenantCompanyConfig(ctx.tenantId);
  const tenantName = cfg.commercialName || cfg.companyName || "Seguridad";
  const tenantMonogram = tenantName.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").slice(0, 2).toUpperCase() || "OP";
  const input = {
    publicUrl: `${getCanonicalSiteUrl()}/r/${qr.token}`,
    tenantName,
    tenantMonogram,
    installationName: inst.name,
    address: [inst.address, inst.commune, inst.city].filter(Boolean).join(", ") || null,
    installationCode: qr.serialLabel,
  };
  const buf = format === "sticker" ? await buildStickerPdf(input) : await buildAficheA4Pdf(input);
  const filename = format === "sticker"
    ? `adhesivo-reporte-${qr.serialLabel}.pdf`
    : `afiche-reporte-${qr.serialLabel}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]+/g, "_")}"`,
    },
  });
}
