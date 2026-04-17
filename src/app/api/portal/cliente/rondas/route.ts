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

    // Build date range filter
    let scheduledAtFilter: Record<string, Date> | undefined;
    if (from || to) {
      scheduledAtFilter = {};
      if (from) scheduledAtFilter.gte = new Date(from);
      if (to) scheduledAtFilter.lte = new Date(to);
    }

    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: session.tenantId,
        installationId: { in: installationIds },
        ...(scheduledAtFilter ? { scheduledAt: scheduledAtFilter } : {}),
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
      take: 50,
    });

    return NextResponse.json({ success: true, data: ejecuciones });
  } catch (error) {
    console.error("[Portal Cliente] rondas list error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
