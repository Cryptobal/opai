import { NextRequest, NextResponse } from "next/server";
import { isReportQrStatus } from "@/lib/incidentes-instalacion/qr-labels";
import { listReportQrs, serializeQrListItem } from "@/lib/incidentes-instalacion/report-qr";
import { requireReportQrAuth } from "./_guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authz = await requireReportQrAuth("view");
  if (authz.error) return authz.error;

  const statusRaw = request.nextUrl.searchParams.get("status") ?? "all";
  const status = statusRaw === "all" || isReportQrStatus(statusRaw) ? statusRaw : "all";
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const loteId = request.nextUrl.searchParams.get("loteId") ?? undefined;
  const installationId = request.nextUrl.searchParams.get("installationId") ?? undefined;

  const data = await listReportQrs({
    tenantId: authz.ctx.tenantId,
    status,
    q,
    loteId: loteId || undefined,
    installationId: installationId || undefined,
  });

  return NextResponse.json({
    success: true,
    data: {
      counts: data.counts,
      items: data.items.map(serializeQrListItem),
    },
  });
}
