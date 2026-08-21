import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromToken } from "@/lib/device-auth";
import { listIncidentes } from "@/lib/incidentes-instalacion/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const device = await getDeviceFromToken(_request);
  if (!device || device.portalIncidentesEnabled === false) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const list = await listIncidentes({
    tenantId: device.tenantId,
    installationIds: [device.installationId],
    filter: "all",
    page: 1,
    limit: 50,
  });
  const item = list.items.find((i) => i.id === id);
  if (!item) {
    return NextResponse.json({ success: false, error: "Incidente no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: item });
}
