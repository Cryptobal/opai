import { NextRequest, NextResponse } from "next/server";
import { requireAccessControlAuth } from "@/lib/access-control/auth";
import {
  accessExportHeaders,
  buildAccessRecordsWhere,
  runAccessRecordsExport,
} from "@/lib/access-control/export";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> },
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (authCtx.authType !== "admin") {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const where = buildAccessRecordsWhere({
      tenantId: authCtx.tenantId,
      installationId,
      status: searchParams.get("status"),
      from,
      to,
      type: searchParams.get("type"),
      search: searchParams.get("search"),
      listMatch: searchParams.get("listMatch"),
      qrSource: searchParams.get("qrSource"),
      guardId: searchParams.get("guardId"),
    });

    const { buffer, filename } = await runAccessRecordsExport({
      tenantId: authCtx.tenantId,
      installationId,
      where,
      from,
      to,
    });

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: accessExportHeaders(filename),
    });
  } catch (error) {
    console.error("[AccessControl] Error exporting records:", error);
    return NextResponse.json(
      { success: false, error: "Error al exportar registros" },
      { status: 500 },
    );
  }
}
