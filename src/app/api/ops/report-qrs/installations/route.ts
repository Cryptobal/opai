import { NextRequest, NextResponse } from "next/server";
import { listAssignableInstallations } from "@/lib/incidentes-instalacion/report-qr";
import { requireReportQrAuth } from "../_guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authz = await requireReportQrAuth("view");
  if (authz.error) return authz.error;
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const latRaw = request.nextUrl.searchParams.get("lat");
  const lngRaw = request.nextUrl.searchParams.get("lng");
  const lat = latRaw == null || latRaw === "" ? null : Number(latRaw);
  const lng = lngRaw == null || lngRaw === "" ? null : Number(lngRaw);
  const items = await listAssignableInstallations({
    tenantId: authz.ctx.tenantId,
    q,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  });
  return NextResponse.json({ success: true, data: items });
}
