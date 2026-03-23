import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { z } from "zod";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";

const resolveSchema = z.object({
  id: z.string().uuid(),
  resolutionNotes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const onlyOpen = request.nextUrl.searchParams.get("open") !== "false";
    const isAcknowledged = request.nextUrl.searchParams.get("isAcknowledged");
    const severidad = request.nextUrl.searchParams.get("severidad");
    const tipo = request.nextUrl.searchParams.get("tipo");
    const tipos = request.nextUrl.searchParams.get("tipos"); // comma-separated multi-type filter
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    const installationId = request.nextUrl.searchParams.get("installationId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const status = request.nextUrl.searchParams.get("status");
    const includeLogs = request.nextUrl.searchParams.get("includeLogs") === "true";

    // If date range is provided (reportes mode), skip turno check
    const isReportesMode = !!(from || to);

    const activeTurnoId = isReportesMode ? null : await getActiveTurnoId(ctx.tenantId);

    // Solo mostrar alertas cuando hay monitoreo activo; si no hay turno, lista vacía
    if (!isReportesMode && !includeArchived && !activeTurnoId) {
      return NextResponse.json({ success: true, data: [], requiresActiveTurno: true });
    }

    const where: Prisma.OpsAlertaRondaWhereInput = {
      tenantId: ctx.tenantId,
      ...(status === "pendiente" ? { resuelta: false } : status === "resuelta" ? { resuelta: true } : onlyOpen && !isReportesMode ? { resuelta: false } : {}),
      ...(isAcknowledged === "true" ? { isAcknowledged: true } : isAcknowledged === "false" ? { isAcknowledged: false } : {}),
      ...(severidad ? { severidad } : {}),
      ...(tipos ? { tipo: { in: tipos.split(",").filter(Boolean) } } : tipo ? { tipo } : {}),
      ...(installationId ? { installationId } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to + "T23:59:59.999Z") } : {}),
            },
          }
        : {}),
      ...(!isReportesMode && !includeArchived
        ? {
            archivedAt: null,
            ...(activeTurnoId ? { turnoId: activeTurnoId } : {}),
          }
        : {}),
    };

    const rows = await prisma.opsAlertaRonda.findMany({
      where,
      include: {
        installation: { select: { id: true, name: true } },
        ejecucion: {
          select: { id: true, status: true, rondaTemplate: { select: { id: true, name: true } } },
        },
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        ...(includeLogs
          ? {
              logs: {
                orderBy: { createdAt: "asc" as const },
                select: {
                  id: true,
                  action: true,
                  userId: true,
                  userName: true,
                  notes: true,
                  metadata: true,
                  createdAt: true,
                },
              },
            }
          : {}),
      },
      orderBy: [{ resuelta: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("[RONDAS] GET alertas", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rondas_resolve_alerts")) {
      return NextResponse.json({ success: false, error: "Sin permisos para resolver alertas" }, { status: 403 });
    }
    const parsed = await parseBody(request, resolveSchema);
    if (parsed.error) return parsed.error;

    const result = await prisma.opsAlertaRonda.updateMany({
      where: { id: parsed.data.id, tenantId: ctx.tenantId },
      data: {
        resuelta: true,
        resueltaPor: ctx.userId,
        resueltaAt: new Date(),
        resolutionNotes: parsed.data.resolutionNotes ?? null,
      },
    });
    if (!result.count) {
      return NextResponse.json({ success: false, error: "Alerta no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] PATCH alertas", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
