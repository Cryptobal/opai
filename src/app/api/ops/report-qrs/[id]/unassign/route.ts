import { NextRequest, NextResponse } from "next/server";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { unassignReportQr } from "@/lib/incidentes-instalacion/report-qr";
import { requireReportQrAuth } from "../../_guard";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireReportQrAuth("edit");
  if (authz.error) return authz.error;
  const { id } = await params;
  try {
    const qr = await unassignReportQr({
      tenantId: authz.ctx.tenantId,
      qrId: id,
      actorId: authz.ctx.userId,
      actorKind: "erp",
    });
    return NextResponse.json({
      success: true,
      data: { id: qr.id, serialLabel: qr.serialLabel, status: qr.status },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[report-qrs/unassign]", err);
    return NextResponse.json({ success: false, error: "No se pudo desasignar el QR" }, { status: 500 });
  }
}
