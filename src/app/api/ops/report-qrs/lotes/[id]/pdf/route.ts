import { NextRequest, NextResponse } from "next/server";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { getReportQrLoteForPdf } from "@/lib/incidentes-instalacion/report-qr";
import { buildStockStickersPdf } from "@/lib/incidentes-instalacion/senaletica-pdf";
import { requireReportQrAuth } from "../../../_guard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireReportQrAuth("view");
  if (authz.error) return authz.error;
  const { id } = await params;
  try {
    const lote = await getReportQrLoteForPdf(authz.ctx.tenantId, id);
    const cfg = await getTenantCompanyConfig(authz.ctx.tenantId);
    const tenantName = cfg.commercialName || cfg.companyName || "Seguridad";
    const tenantMonogram = tenantName.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "").slice(0, 2).toUpperCase() || "OP";
    const base = getCanonicalSiteUrl();
    const buf = await buildStockStickersPdf({
      tenantName,
      tenantMonogram,
      loteCode: lote.code,
      items: lote.qrs
        .filter((q) => q.status !== "retired")
        .map((q) => ({
          publicUrl: `${base}/r/${q.token}`,
          serialLabel: q.serialLabel,
        })),
    });
    const filename = `lote-qr-incidencias-${lote.code}.pdf`;
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
    console.error("[report-qrs/lotes/pdf]", err);
    return NextResponse.json({ success: false, error: "No se pudo generar el PDF" }, { status: 500 });
  }
}
