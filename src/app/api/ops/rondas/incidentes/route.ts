import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const installationId = sp.get("installationId");
    const from = sp.get("from");
    const to = sp.get("to");
    const status = sp.get("status");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (installationId) where.installationId = installationId;
    if (status && status !== "all") where.status = status;
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) createdAt.lte = new Date(to + "T23:59:59.999Z");
      where.createdAt = createdAt;
    }

    const incidentes = await prisma.opsRondaIncidente.findMany({
      where,
      include: {
        ejecucion: {
          select: {
            id: true,
            status: true,
            rondaTemplate: { select: { name: true } },
          },
        },
        installation: { select: { id: true, name: true } },
        guardia: {
          select: {
            id: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({ success: true, data: incidentes });
  } catch (error) {
    console.error("[RONDAS] GET incidentes", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
