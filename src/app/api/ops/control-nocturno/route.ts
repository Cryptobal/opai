import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly, toISODate, createOpsAuditLog } from "@/lib/ops";

/* ── GET — listar reportes nocturnos ── */

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const dateFrom = request.nextUrl.searchParams.get("dateFrom");
    const dateTo = request.nextUrl.searchParams.get("dateTo");
    const status = request.nextUrl.searchParams.get("status");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (dateFrom) where.date = { ...(where.date as object || {}), gte: parseDateOnly(dateFrom) };
    if (dateTo) where.date = { ...(where.date as object || {}), lte: parseDateOnly(dateTo) };
    if (status && status !== "all") where.status = status;

    const reportes = await prisma.opsControlNocturno.findMany({
      where,
      include: {
        instalaciones: {
          select: {
            id: true,
            installationName: true,
            statusInstalacion: true,
            guardiasRequeridos: true,
            guardiasPresentes: true,
          },
        },
      },
      orderBy: { date: "desc" },
      take: 50,
    });

    return NextResponse.json({ success: true, data: reportes });
  } catch (error) {
    console.error("[OPS] Error listing control nocturno:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los reportes nocturnos" },
      { status: 500 },
    );
  }
}

/* ── POST — crear nuevo reporte nocturno ── */

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const {
      date,
      centralOperatorName,
      centralLabel,
      shiftStart,
      shiftEnd,
      installationIds,
    } = body as {
      date: string;
      centralOperatorName: string;
      centralLabel?: string;
      shiftStart?: string;
      shiftEnd?: string;
      installationIds?: string[];
    };

    if (!date || !centralOperatorName) {
      return NextResponse.json(
        { success: false, error: "Fecha y nombre del operador son requeridos" },
        { status: 400 },
      );
    }

    const parsedDate = parseDateOnly(date);

    // Obtener instalaciones activas si no se especifican
    let installations: { id: string; name: string }[];
    if (installationIds && installationIds.length > 0) {
      installations = await prisma.crmInstallation.findMany({
        where: { id: { in: installationIds } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    } else {
      // Obtener instalaciones activas con nocturno habilitado
      installations = await prisma.crmInstallation.findMany({
        where: {
          account: { tenantId: ctx.tenantId },
          isActive: true,
          nocturnoEnabled: true,
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }

    // Horas estándar de rondas nocturnas
    const RONDA_HOURS = [
      "20:00", "21:00", "22:00", "23:00",
      "00:00", "01:00", "02:00", "03:00",
      "04:00", "05:00", "06:00", "07:00",
    ];

    const reporte = await prisma.opsControlNocturno.create({
      data: {
        tenantId: ctx.tenantId,
        date: parsedDate,
        centralOperatorName,
        centralLabel: centralLabel || null,
        shiftStart: shiftStart || "19:00",
        shiftEnd: shiftEnd || "08:00",
        status: "borrador",
        createdBy: ctx.userId,
        instalaciones: {
          create: installations.map((inst, idx) => ({
            installationId: inst.id,
            installationName: inst.name,
            orderIndex: idx + 1,
            guardiasRequeridos: 1,
            guardiasPresentes: 0,
            statusInstalacion: "normal",
            rondas: {
              create: RONDA_HOURS.map((hora, rIdx) => ({
                rondaNumber: rIdx + 1,
                horaEsperada: hora,
                status: "pendiente",
              })),
            },
          })),
        },
      },
      include: {
        instalaciones: {
          include: {
            guardias: true,
            rondas: { orderBy: { rondaNumber: "asc" } },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    await createOpsAuditLog(ctx, "create", "control_nocturno", reporte.id, {
      date,
      centralOperatorName,
      installationsCount: installations.length,
    });

    return NextResponse.json({ success: true, data: reporte }, { status: 201 });
  } catch (error) {
    console.error("[OPS] Error creating control nocturno:", error);
    const msg = error instanceof Error ? error.message : "Error al crear reporte";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
