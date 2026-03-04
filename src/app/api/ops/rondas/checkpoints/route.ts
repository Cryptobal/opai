import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { checkpointSchema } from "@/lib/validations/rondas";
import { generateMarcacionCode } from "@/lib/marcacion";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId") ?? undefined;
    const checkpoints = await prisma.opsCheckpoint.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(installationId ? { installationId } : {}),
      },
      include: {
        installation: { select: { id: true, name: true } },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    const withStats = request.nextUrl.searchParams.get("withStats") === "true";
    if (withStats) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const enriched = await Promise.all(
        checkpoints.map(async (cp) => {
          const [markCount, lastMark, totalRounds] = await Promise.all([
            prisma.opsMarcacionCheckpoint.count({
              where: { checkpointId: cp.id, status: "COMPLETED", timestamp: { gte: thirtyDaysAgo } },
            }),
            prisma.opsMarcacionCheckpoint.findFirst({
              where: { checkpointId: cp.id, status: "COMPLETED" },
              orderBy: { timestamp: "desc" },
              select: { timestamp: true },
            }),
            prisma.opsRondaEjecucion.count({
              where: {
                rondaTemplate: { installationId: cp.installationId },
                status: "completada",
                completedAt: { gte: thirtyDaysAgo },
              },
            }),
          ]);
          return {
            ...cp,
            coveragePercent: totalRounds > 0 ? Math.round((markCount / totalRounds) * 100) : 0,
            lastMarkedAt: lastMark?.timestamp ?? null,
          };
        }),
      );
      return NextResponse.json({ success: true, data: enriched });
    }

    return NextResponse.json({ success: true, data: checkpoints });
  } catch (error) {
    console.error("[RONDAS] GET checkpoints", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const parsed = await parseBody(request, checkpointSchema);
    if (parsed.error) return parsed.error;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: parsed.data.installationId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    const qrCode = parsed.data.qrCode ?? generateMarcacionCode();
    const created = await prisma.opsCheckpoint.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: parsed.data.installationId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        instrucciones: parsed.data.instrucciones ?? null,
        qrCode,
        lat: parsed.data.lat ?? null,
        lng: parsed.data.lng ?? null,
        geoRadiusM: parsed.data.geoRadiusM,
        verificationType: parsed.data.verificationType,
        isCritical: parsed.data.isCritical,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive ?? true,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("[RONDAS] POST checkpoints", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
