import { NextRequest, NextResponse } from "next/server";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { deleteReportQr, getReportQrDetail } from "@/lib/incidentes-instalacion/report-qr";
import { requireReportQrAuth } from "../_guard";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireReportQrAuth("view");
  if (authz.error) return authz.error;
  const { id } = await params;
  try {
    const data = await getReportQrDetail(authz.ctx.tenantId, id);
    return NextResponse.json({
      success: true,
      data: {
        id: data.qr.id,
        serialLabel: data.qr.serialLabel,
        status: data.qr.status,
        loteCode: data.qr.lote.code,
        installationId: data.qr.installationId,
        installationName: data.qr.installation?.name ?? null,
        assignedAt: data.qr.assignedAt,
        publicUrl: data.publicUrl,
        events: data.events,
      },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[report-qrs/id]", err);
    return NextResponse.json({ success: false, error: "No se pudo cargar el QR" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireReportQrAuth("edit");
  if (authz.error) return authz.error;
  const { id } = await params;
  try {
    const data = await deleteReportQr({
      tenantId: authz.ctx.tenantId,
      qrId: id,
      actorId: authz.ctx.userId,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[report-qrs/id DELETE]", err);
    return NextResponse.json({ success: false, error: "No se pudo eliminar el QR" }, { status: 500 });
  }
}
