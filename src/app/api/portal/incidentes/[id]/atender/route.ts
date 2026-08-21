import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromToken } from "@/lib/device-auth";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { atenderIncidente } from "@/lib/incidentes-instalacion/lifecycle";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const device = await getDeviceFromToken(request);
  if (!device || device.portalIncidentesEnabled === false) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const result = await atenderIncidente({
      tenantId: device.tenantId,
      ticketId: id,
      actorId: device.currentGuardId ?? device.id,
      guardiaId: device.currentGuardId,
      installationId: device.installationId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    return NextResponse.json({ success: false, error: "No se pudo atender" }, { status: 500 });
  }
}
