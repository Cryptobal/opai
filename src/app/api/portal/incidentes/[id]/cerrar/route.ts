import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromToken } from "@/lib/device-auth";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { cerrarIncidente } from "@/lib/incidentes-instalacion/lifecycle";
import { assertOwnedStorageKey, assertReportFile } from "@/lib/incidentes-instalacion/create-public";

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
    const body = await request.json();
    const files = Array.isArray(body.files) ? body.files : [];
    const mapped = files.map((f: Record<string, unknown>) => {
      const contentType = String(f.contentType ?? "");
      const storageKey = String(f.storageKey ?? "");
      const fileSize = Number(f.fileSize ?? f.size ?? 0);
      assertReportFile({ mimeType: contentType, fileSize });
      assertOwnedStorageKey(device.tenantId, storageKey);
      return {
        storageKey,
        fileName: String(f.fileName ?? "cierre.jpg"),
        contentType,
        fileSize,
      };
    });
    const result = await cerrarIncidente({
      tenantId: device.tenantId,
      ticketId: id,
      actorId: device.currentGuardId ?? device.id,
      guardiaId: device.currentGuardId,
      installationId: device.installationId,
      comment: String(body.comment ?? body.resolutionNotes ?? ""),
      files: mapped,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    return NextResponse.json({ success: false, error: "No se pudo cerrar" }, { status: 500 });
  }
}
