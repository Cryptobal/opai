import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import {
  buildControlNocturnoPdfFileName,
  getControlNocturnoForPdf,
  renderControlNocturnoPdfBuffer,
} from "@/lib/control-nocturno-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteParams = { params: Promise<{ id: string }> };

/* ── GET ── */

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const reporte = await getControlNocturnoForPdf(id, ctx.tenantId);
    if (!reporte) {
      return NextResponse.json(
        { success: false, error: "Reporte no encontrado" },
        { status: 404 },
      );
    }
    const pdfBuffer = await renderControlNocturnoPdfBuffer(reporte);

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${buildControlNocturnoPdfFileName(reporte.date)}"`,
      },
    });
  } catch (error) {
    console.error("[OPS] Error exporting control nocturno PDF:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo generar el PDF" },
      { status: 500 },
    );
  }
}
