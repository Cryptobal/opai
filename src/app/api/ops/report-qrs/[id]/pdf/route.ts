import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { getReportQrDetail } from "@/lib/incidentes-instalacion/report-qr";
import { buildAficheA4Pdf, buildStickerPdf } from "@/lib/incidentes-instalacion/senaletica-pdf";
import { requireReportQrAuth } from "../../_guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireReportQrAuth("view");
  if (authz.error) return authz.error;
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") === "sticker" ? "sticker" : "a4";
  try {
    const data = await getReportQrDetail(authz.ctx.tenantId, id);
    if (data.qr.status === "retired") {
      return NextResponse.json(
        { success: false, error: "Este QR fue retirado y no se imprime." },
        { status: 422 },
      );
    }
    const cfg = await getTenantCompanyConfig(authz.ctx.tenantId);
    const tenantName = cfg.commercialName || cfg.companyName || "Seguridad";
    const tenantMonogram = tenantName.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").slice(0, 2).toUpperCase() || "OP";
    const instName = data.qr.installation?.name ?? "Sin asignar";
    const address = data.qr.installation
      ? [data.qr.installation.address, data.qr.installation.commune, data.qr.installation.city]
          .filter(Boolean)
          .join(", ") || null
      : null;
    const input = {
      publicUrl: `${getCanonicalSiteUrl()}/r/${data.qr.token}`,
      tenantName,
      tenantMonogram,
      installationName: data.qr.status === "assigned" ? instName : data.qr.serialLabel,
      address: data.qr.status === "assigned" ? address : data.qr.serialLabel,
      installationCode: data.qr.serialLabel,
    };
    const buf = format === "sticker" ? await buildStickerPdf(input) : await buildAficheA4Pdf(input);
    const filename = format === "sticker"
      ? `adhesivo-${data.qr.serialLabel}.pdf`
      : `afiche-${data.qr.serialLabel}.pdf`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]+/g, "_")}"`,
      },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[report-qrs/pdf]", err);
    return NextResponse.json({ success: false, error: "No se pudo generar el PDF" }, { status: 500 });
  }
}
