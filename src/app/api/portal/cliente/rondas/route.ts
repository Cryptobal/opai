/**
 * API Route: /api/portal/cliente/rondas
 * GET — List ronda executions for the client's account installations.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    // Atajo: `days` produce un filtro from = now - N días (ignorado si `from`
    // explícito está presente). Default 30 días para proteger contra listas
    // infinitas cuando el tenant tiene histórico grande.
    const daysRaw = request.nextUrl.searchParams.get("days");
    const days = daysRaw != null ? Math.max(1, Math.min(365, parseInt(daysRaw, 10) || 30)) : null;
    // Paginación: `cursor` = ISO string de scheduledAt del último item recibido.
    const cursor = request.nextUrl.searchParams.get("cursor");
    const pageSize = Math.max(1, Math.min(100, parseInt(request.nextUrl.searchParams.get("pageSize") ?? "30", 10) || 30));

    // Resolve installation IDs authorized for this account
    let installationIds: string[];

    if (installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: {
          id: installationId,
          accountId: session.accountId,
          tenantId: session.tenantId,
        },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Instalacion no encontrada" },
          { status: 404 }
        );
      }
      installationIds = [installationId];
    } else {
      const installations = await prisma.crmInstallation.findMany({
        where: {
          accountId: session.accountId,
          tenantId: session.tenantId,
        },
        select: { id: true },
      });
      installationIds = installations.map((i) => i.id);
    }

    if (installationIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Build date range filter. `from`/`to` explícitos ganan; si no, usamos
    // `days` (default 30) para evitar que la lista crezca sin control.
    const scheduledAtFilter: { gte?: Date; lte?: Date } = {};
    if (from) {
      scheduledAtFilter.gte = new Date(from);
    } else if (days != null) {
      scheduledAtFilter.gte = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    } else {
      scheduledAtFilter.gte = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    if (to) scheduledAtFilter.lte = new Date(to);

    // Cursor-based pagination sobre scheduledAt (desc). El cursor es el
    // scheduledAt del último item del page anterior, por lo que pedimos `lt`.
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        scheduledAtFilter.lte = cursorDate;
      }
    }

    // Las ejecuciones programadas (generadas por cron) pueden venir con
    // `installationId = null` y la instalación se resuelve a través del
    // rondaTemplate. Mantenemos ambos caminos para no perder esas rondas.
    const installationScope = {
      OR: [
        { installationId: { in: installationIds } },
        { rondaTemplate: { installationId: { in: installationIds } } },
      ],
    };

    // Pedimos pageSize + 1 para saber si hay más páginas sin un count adicional.
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: session.tenantId,
        ...installationScope,
        scheduledAt: scheduledAtFilter,
      },
      select: {
        id: true,
        installationId: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        checkpointsTotal: true,
        checkpointsCompletados: true,
        porcentajeCompletado: true,
        trustScore: true,
        durationMinutes: true,
        notes: true,
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { scheduledAt: "desc" },
      take: pageSize + 1,
    });

    const hasMore = ejecuciones.length > pageSize;
    const page = hasMore ? ejecuciones.slice(0, pageSize) : ejecuciones;
    const nextCursor = hasMore
      ? page[page.length - 1]?.scheduledAt.toISOString() ?? null
      : null;

    return NextResponse.json({
      success: true,
      data: page,
      pagination: { nextCursor, hasMore, pageSize },
    });
  } catch (error) {
    console.error("[Portal Cliente] rondas list error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
