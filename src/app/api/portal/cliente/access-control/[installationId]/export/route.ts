import { NextRequest, NextResponse } from "next/server";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";
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
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { installationId } = await params;
    if (!(await ensureInstallationAccess(session, installationId))) {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const where = buildAccessRecordsWhere({
      tenantId: session.tenantId,
      installationId,
      status: searchParams.get("status"),
      from,
      to,
      type: searchParams.get("type"),
      search: searchParams.get("search"),
    });

    const { buffer, filename } = await runAccessRecordsExport({
      tenantId: session.tenantId,
      installationId,
      where,
      from,
      to,
    });

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: accessExportHeaders(filename),
    });
  } catch (error) {
    console.error("[ClientPortal] Error exporting access history:", error);
    return NextResponse.json(
      { success: false, error: "Error al exportar historial" },
      { status: 500 },
    );
  }
}
