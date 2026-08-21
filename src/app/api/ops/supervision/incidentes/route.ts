import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { listSupervisorInstallationIds } from "@/lib/incidentes-instalacion/service";
import { getIncidentesKpis, listIncidentes, type IncidenteListFilter } from "@/lib/incidentes-instalacion/queries";
import { rechazarIncidente, validarIncidente } from "@/lib/incidentes-instalacion/lifecycle";

export const dynamic = "force-dynamic";

async function scope(ctx: { tenantId: string; userId: string; userRole: string; roleTemplateId?: string | null }) {
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "ops", "supervision") && !canView(perms, "ops", "tickets")) {
    return { error: NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 }) };
  }
  const viewAll = hasCapability(perms, "supervision_view_all");
  const ids = await listSupervisorInstallationIds({
    tenantId: ctx.tenantId,
    adminId: ctx.userId,
    viewAll,
  });
  return { ids, viewAll };
}

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const scoped = await scope(ctx);
  if ("error" in scoped) return scoped.error;
  const sp = request.nextUrl.searchParams;
  const filter = (sp.get("filter") ?? "por_validar") as IncidenteListFilter;
  const installationIds = scoped.ids;
  const [list, kpis] = await Promise.all([
    listIncidentes({
      tenantId: ctx.tenantId,
      installationIds,
      filter,
      page: parseInt(sp.get("page") ?? "1", 10),
      limit: 40,
    }),
    getIncidentesKpis({ tenantId: ctx.tenantId, installationIds }),
  ]);
  return NextResponse.json({ success: true, data: { ...list, kpis } });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const scoped = await scope(ctx);
  if ("error" in scoped) return scoped.error;
  try {
    const body = await request.json();
    const ticketId = String(body.ticketId ?? body.id ?? "");
    const action = String(body.action ?? "");
    if (!ticketId) {
      return NextResponse.json({ success: false, error: "ticketId requerido" }, { status: 400 });
    }
    if (scoped.ids) {
      if (scoped.ids.length === 0) {
        return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
      }
      const owned = await prisma.opsTicket.findFirst({
        where: {
          id: ticketId,
          tenantId: ctx.tenantId,
          installationId: { in: scoped.ids },
        },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
      }
    }
    const actorName = ctx.userEmail || "Supervisión";
    if (action === "validar") {
      const result = await validarIncidente({
        tenantId: ctx.tenantId,
        ticketId,
        actorId: ctx.userId,
        actorName,
      });
      return NextResponse.json({ success: true, data: result });
    }
    if (action === "rechazar") {
      const result = await rechazarIncidente({
        tenantId: ctx.tenantId,
        ticketId,
        actorId: ctx.userId,
        actorName,
        reason: String(body.reason ?? ""),
      });
      return NextResponse.json({ success: true, data: result });
    }
    return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[supervision/incidentes]", err);
    return NextResponse.json({ success: false, error: "No se pudo completar la acción" }, { status: 500 });
  }
}
