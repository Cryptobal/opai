import { NextRequest, NextResponse } from "next/server";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { deleteReportQrLote } from "@/lib/incidentes-instalacion/report-qr";
import { requireReportQrAuth } from "../../_guard";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireReportQrAuth("edit");
  if (authz.error) return authz.error;
  const { id } = await params;
  try {
    const data = await deleteReportQrLote({
      tenantId: authz.ctx.tenantId,
      loteId: id,
      actorId: authz.ctx.userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[report-qrs/lotes/id DELETE]", err);
    return NextResponse.json({ success: false, error: "No se pudo eliminar el lote" }, { status: 500 });
  }
}
