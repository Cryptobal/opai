import { NextRequest, NextResponse } from "next/server";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { assignReportQr } from "@/lib/incidentes-instalacion/report-qr";
import { requireReportQrAuth } from "../../_guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authz = await requireReportQrAuth("edit");
  if (authz.error) return authz.error;
  const { id } = await params;
  try {
    const body = await request.json();
    const installationId = String(body.installationId ?? "");
    if (!installationId) {
      return NextResponse.json({ success: false, error: "Elige una instalación" }, { status: 422 });
    }
    const qr = await assignReportQr({
      tenantId: authz.ctx.tenantId,
      qrId: id,
      installationId,
      actorId: authz.ctx.userId,
      actorKind: "erp",
    });
    return NextResponse.json({
      success: true,
      data: {
        id: qr.id,
        serialLabel: qr.serialLabel,
        status: qr.status,
        installationId: qr.installationId,
        installationName: qr.installation?.name ?? null,
      },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[report-qrs/assign]", err);
    return NextResponse.json({ success: false, error: "No se pudo asignar el QR" }, { status: 500 });
  }
}
