import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl } from "@/lib/storage";
import { checkRateLimit, getClientIp, getPublicReporteUploadRateLimit } from "@/lib/rate-limit";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { resolveReportToken } from "@/lib/incidentes-instalacion/service";
import { assertReportFile, maxBytesForMime } from "@/lib/incidentes-instalacion/create-public";
import { sanitizeUploadFileName, truncateToken } from "@/lib/incidentes-instalacion/tokens";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const ip = getClientIp(request);
    const mem = checkRateLimit(`reporte-upload:${ip}:${truncateToken(token)}`, {
      limit: 20,
      windowSeconds: 600,
    });
    if (!mem.allowed) {
      return NextResponse.json(
        { success: false, error: "Demasiadas subidas. Espera unos minutos.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
    const upstash = getPublicReporteUploadRateLimit();
    if (upstash) {
      const r = await upstash.limit(`${ip}:${truncateToken(token)}`);
      if (!r.success) {
        return NextResponse.json(
          { success: false, error: "Demasiadas subidas. Espera unos minutos.", code: "RATE_LIMITED" },
          { status: 429 },
        );
      }
    }

    const inst = await resolveReportToken(token);
    const body = await request.json();
    const mimeType = String(body.mimeType ?? body.contentType ?? "");
    const fileName = sanitizeUploadFileName(String(body.fileName ?? "archivo"));
    const fileSize = body.fileSize == null ? undefined : Number(body.fileSize);
    assertReportFile({ mimeType, fileSize });

    const sessionId = randomUUID();
    const signed = await getPresignedUploadUrl({
      fileName,
      mimeType,
      prefix: `incidentes/${sessionId}`,
      tenantId: inst.tenantId,
      expiresInSeconds: 300,
    });

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl: signed.uploadUrl,
        storageKey: signed.storageKey,
        expiresIn: signed.expiresIn,
        maxBytes: maxBytesForMime(mimeType),
      },
    });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[public/reporte/upload-url]", err);
    return NextResponse.json(
      { success: false, error: "No se pudo preparar la subida", code: "VALIDATION_ERROR" },
      { status: 500 },
    );
  }
}
