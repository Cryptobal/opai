import { NextRequest, NextResponse } from "next/server";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { assignReportQr, lookupReportQr } from "@/lib/incidentes-instalacion/report-qr";
import { resolveReportQrStaffActor } from "@/lib/incidentes-instalacion/report-qr-staff";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const actor = await resolveReportQrStaffActor(request);
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Inicia sesión o usa el dispositivo de la instalación para asignar este QR.", code: "NOT_FOUND" },
      { status: 401 },
    );
  }
  if (actor.kind === "erp" && !actor.canEdit) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para asignar QR.", code: "NOT_FOUND" },
      { status: 403 },
    );
  }

  const lookup = await lookupReportQr(token);
  if (lookup.kind === "missing" || lookup.kind === "retired") {
    return NextResponse.json(
      { success: false, error: "Este QR ya no está vigente.", code: "TOKEN_INVALID" },
      { status: 404 },
    );
  }
  if (lookup.qr.tenantId !== actor.tenantId) {
    return NextResponse.json(
      { success: false, error: "Este QR no pertenece a tu empresa.", code: "TOKEN_INVALID" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const requestedId = typeof body.installationId === "string" ? body.installationId : "";
    const installationId = actor.kind === "device" ? actor.installationId : requestedId;
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "Elige una instalación.", code: "VALIDATION_ERROR" },
        { status: 422 },
      );
    }
    if (lookup.qr.id.startsWith("legacy:")) {
      return NextResponse.json(
        { success: false, error: "Este QR legado no se puede reasignar. Genera un lote nuevo.", code: "VALIDATION_ERROR" },
        { status: 422 },
      );
    }
    const qr = await assignReportQr({
      tenantId: actor.tenantId,
      qrId: lookup.qr.id,
      installationId,
      actorId: actor.actorId,
      actorKind: actor.kind,
    });
    return NextResponse.json({
      success: true,
      data: {
        serialLabel: qr.serialLabel,
        installationId: qr.installationId,
        installationName: qr.installation?.name ?? null,
      },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[public/reporte/assign]", err);
    return NextResponse.json(
      { success: false, error: "No se pudo asignar el QR", code: "VALIDATION_ERROR" },
      { status: 500 },
    );
  }
}
