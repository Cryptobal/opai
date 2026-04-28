import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { buildInstallationDetail } from "@/lib/protocols/knowledge-aggregator";

export const dynamic = "force-dynamic";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "guardias")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver Conocimiento" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const detail = await buildInstallationDetail(ctx.tenantId, id, {
      anonymize: false,
      includeTrend: true,
    });

    if (!detail) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: detail });
  } catch (err) {
    console.error("[knowledge/installation-detail]", err);
    return NextResponse.json(
      { success: false, error: "Error obteniendo el detalle" },
      { status: 500 },
    );
  }
}
