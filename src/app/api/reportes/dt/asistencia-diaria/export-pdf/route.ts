import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { renderToBuffer } from "@react-pdf/renderer";
import { AsistenciaDiariaPdf } from "@/components/reportes-dt/AsistenciaDiariaPdf";
import { queryAsistenciaExportRows } from "@/modules/reportes-dt/legacy";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "reportes_dt")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { from, to, installationId } = await request.json();

    const records = await queryAsistenciaExportRows(ctx.tenantId, from, to, installationId);

    const buffer = await renderToBuffer(
      AsistenciaDiariaPdf({ records, from, to })
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="asistencia-diaria-${from}-${to}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[DT] Error export-pdf asistencia-diaria:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
