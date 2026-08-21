import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getIncidentesKpis, listIncidentes } from "@/lib/incidentes-instalacion/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "ops") && !canView(perms, "crm", "installations")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const { id } = await params;
  const inst = await prisma.crmInstallation.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!inst) {
    return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
  }
  const sp = request.nextUrl.searchParams;
  const filter = (sp.get("filter") as "all" | "abiertos" | "por_validar" | "validados") || "all";
  const page = parseInt(sp.get("page") ?? "1", 10);
  const [list, kpis] = await Promise.all([
    listIncidentes({
      tenantId: ctx.tenantId,
      installationIds: [id],
      filter,
      page,
      limit: parseInt(sp.get("limit") ?? "20", 10),
    }),
    getIncidentesKpis({ tenantId: ctx.tenantId, installationIds: [id] }),
  ]);
  return NextResponse.json({ success: true, data: { ...list, kpis } });
}
