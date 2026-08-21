import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromToken } from "@/lib/device-auth";
import { listIncidentes } from "@/lib/incidentes-instalacion/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const device = await getDeviceFromToken(request);
  if (!device) {
    return NextResponse.json({ success: false, error: "Dispositivo no autorizado" }, { status: 401 });
  }
  if (device.portalIncidentesEnabled === false) {
    return NextResponse.json({ success: false, error: "Módulo de incidentes deshabilitado" }, { status: 401 });
  }
  const filter = request.nextUrl.searchParams.get("filter") === "all" ? "all" : undefined;
  const list = await listIncidentes({
    tenantId: device.tenantId,
    installationIds: [device.installationId],
    filter: filter === "all" ? "all" : undefined,
    page: 1,
    limit: 50,
  });
  const nuevos = list.items.filter((i) => i.status === "open").length;
  return NextResponse.json({
    success: true,
    data: { ...list, nuevos, installationId: device.installationId },
  });
}
