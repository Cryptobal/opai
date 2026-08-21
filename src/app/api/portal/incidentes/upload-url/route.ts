import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDeviceFromToken } from "@/lib/device-auth";
import { getPresignedUploadUrl } from "@/lib/storage";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { assertReportFile, maxBytesForMime } from "@/lib/incidentes-instalacion/create-public";
import { sanitizeUploadFileName } from "@/lib/incidentes-instalacion/tokens";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const device = await getDeviceFromToken(request);
  if (!device || device.portalIncidentesEnabled === false) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const mimeType = String(body.mimeType ?? body.contentType ?? "");
    const fileName = sanitizeUploadFileName(String(body.fileName ?? "cierre.jpg"));
    const fileSize = body.fileSize == null ? undefined : Number(body.fileSize);
    assertReportFile({ mimeType, fileSize });
    const signed = await getPresignedUploadUrl({
      fileName,
      mimeType,
      prefix: `incidentes/${randomUUID()}`,
      tenantId: device.tenantId,
      expiresInSeconds: 300,
    });
    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: signed.uploadUrl,
        storageKey: signed.storageKey,
        maxBytes: maxBytesForMime(mimeType),
      },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    return NextResponse.json({ success: false, error: "No se pudo preparar la subida" }, { status: 500 });
  }
}
