/**
 * GET /api/public/cobro/[token]/pdf
 *
 * Devuelve el PDF de la variante activa (Proforma / Estado de Pago) del
 * documento asociado al token. Sin auth: el token (24 bytes) es la defensa y
 * el scope es ese único documento. Reusa el mismo pipeline PDF del envío.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCobroDocMeta } from "@/modules/finance/billing/cobro-confirmation.service";
import { buildBillingDocProps } from "@/lib/pdf/templates/billing-doc/build-billing-doc-props";
import { renderBillingDocPdf } from "@/lib/pdf/templates/billing-doc/render-billing-doc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const meta = await getCobroDocMeta(token);
  if (!meta) {
    return NextResponse.json(
      { success: false, error: "Este enlace no es válido." },
      { status: 404, headers: NO_STORE },
    );
  }
  if (meta.expired) {
    return NextResponse.json(
      { success: false, error: "Este enlace expiró." },
      { status: 410, headers: NO_STORE },
    );
  }
  try {
    const props = await buildBillingDocProps(meta.tenantId, meta.dteId, meta.variant);
    const pdf = await renderBillingDocPdf(props);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${meta.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[public/cobro/pdf] render error:", err);
    return NextResponse.json(
      { success: false, error: "No se pudo generar el PDF." },
      { status: 500, headers: NO_STORE },
    );
  }
}
