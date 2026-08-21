import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, getPublicReporteRateLimit, getPublicReporteTokenHourRateLimit } from "@/lib/rate-limit";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { createPublicReport, getPublicReportContext } from "@/lib/incidentes-instalacion/create-public";
import { truncateToken } from "@/lib/incidentes-instalacion/tokens";

export const dynamic = "force-dynamic";

function jsonError(err: unknown) {
  if (err instanceof IncidenteError) {
    return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
  }
  console.error("[public/reporte]", err);
  return NextResponse.json(
    { success: false, error: "No se pudo procesar el reporte", code: "VALIDATION_ERROR" },
    { status: 500 },
  );
}

async function enforceLimiters(request: NextRequest, token: string): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const mem = checkRateLimit(`reporte:${ip}`, { limit: 3, windowSeconds: 600 });
  if (!mem.allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiados reportes. Espera unos minutos.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  const upstashIp = getPublicReporteRateLimit();
  if (upstashIp) {
    const r = await upstashIp.limit(ip);
    if (!r.success) {
      return NextResponse.json(
        { success: false, error: "Demasiados reportes. Espera unos minutos.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
  }
  const upstashToken = getPublicReporteTokenHourRateLimit();
  if (upstashToken) {
    const r = await upstashToken.limit(truncateToken(token));
    if (!r.success) {
      return NextResponse.json(
        { success: false, error: "Este canal recibió demasiados reportes. Intenta más tarde.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const data = await getPublicReportContext(token);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const limited = await enforceLimiters(request, token);
    if (limited) return limited;

    const body = await request.json();
    const files = Array.isArray(body.files) ? body.files : [];
    const gps = body.gps && typeof body.gps === "object" ? body.gps : body;
    const latRaw = gps.lat ?? body.lat;
    const lngRaw = gps.lng ?? body.lng;
    const accRaw = gps.accuracy ?? body.accuracy;
    const result = await createPublicReport({
      token,
      category: String(body.category ?? ""),
      description: typeof body.description === "string" ? body.description : "",
      lat: typeof latRaw === "number" && Number.isFinite(latRaw) ? latRaw : null,
      lng: typeof lngRaw === "number" && Number.isFinite(lngRaw) ? lngRaw : null,
      accuracy: accRaw == null || accRaw === "" ? null : Number(accRaw),
      files: files.map((f: Record<string, unknown>) => ({
        storageKey: String(f.storageKey ?? ""),
        fileName: String(f.fileName ?? "archivo"),
        contentType: String(f.contentType ?? ""),
        fileSize: Number(f.fileSize ?? f.size ?? 0),
      })),
      reporterName: typeof body.reporterName === "string" ? body.reporterName : undefined,
      reporterContact: typeof body.reporterContact === "string" ? body.reporterContact : undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    });
    return NextResponse.json({
      success: true,
      data: { code: result.code, followUrl: result.followUrl },
    });
  } catch (err) {
    return jsonError(err);
  }
}
