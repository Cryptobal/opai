import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import {
  createOpsAuditLog,
  decimalToNumber,
  ensureOpsAccess,
  parseDateOnly,
} from "@/lib/ops";
import { createTeManualSchema } from "@/lib/validations/ops";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createTeManualSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const [installation, guardia] = await Promise.all([
      prisma.crmInstallation.findFirst({
        where: { id: body.installationId, tenantId: ctx.tenantId },
        select: {
          id: true,
          teMontoClp: true,
          opsPuestos: { where: { active: true }, select: { id: true, teMontoClp: true } },
        },
      }),
      prisma.opsGuardia.findFirst({
        where: { id: body.guardiaId, tenantId: ctx.tenantId },
        select: { id: true, status: true, isBlacklisted: true },
      }),
    ]);

    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }
    if (guardia.status !== "active" || guardia.isBlacklisted) {
      return NextResponse.json(
        { success: false, error: "No se puede asignar turno extra a guardia inactivo o en lista negra" },
        { status: 400 }
      );
    }

    const puesto = body.puestoId
      ? installation.opsPuestos.find((p) => p.id === body.puestoId)
      : null;
    const defaultAmount =
      (puesto && decimalToNumber(puesto.teMontoClp) > 0
        ? decimalToNumber(puesto.teMontoClp)
        : decimalToNumber(installation.teMontoClp)) || 0;
    const amountClp = body.amountClp ?? defaultAmount;

    const date = parseDateOnly(body.date);

    const duplicate = await prisma.opsTurnoExtra.findFirst({
      where: {
        tenantId: ctx.tenantId,
        guardiaId: body.guardiaId,
        date,
        puestoId: body.puestoId ?? null,
        status: { in: ["pending", "approved"] },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { success: false, error: "Ya existe un turno/hora extra para este guardia en esta fecha y puesto" },
        { status: 400 }
      );
    }

    const turno = await prisma.opsTurnoExtra.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: body.installationId,
        puestoId: body.puestoId ?? null,
        guardiaId: body.guardiaId,
        date,
        tipo: body.tipo,
        isManual: true,
        horasExtra: body.horasExtra ?? null,
        amountClp,
        amountJustification: body.amountJustification ?? null,
        status: "pending",
        createdBy: ctx.userId,
      },
      include: {
        installation: { select: { id: true, name: true } },
        puesto: { select: { id: true, name: true } },
        guardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
      },
    });

    await createOpsAuditLog(ctx, "te.created_manual", "te_turno", turno.id, { tipo: body.tipo });

    // Notifica a los aprobadores (bell/push + tarjeta Slack accionable). Difusión
    // por audiencia (admins con visión de turnos extra); no hay aprobador asignado.
    try {
      const { notify } = await import("@/lib/notifications/notify");
      const guardiaNombre = [turno.guardia?.persona?.firstName, turno.guardia?.persona?.lastName].filter(Boolean).join(" ") || "Guardia";
      await notify({
        tenantId: ctx.tenantId,
        type: "te_created",
        title: "Turno extra por aprobar",
        body: `${guardiaNombre} · ${turno.installation?.name ?? "—"} · $${Number(turno.amountClp).toLocaleString("es-CL")}`,
        link: `/ops/turnos-extra/aprobaciones`,
        data: {
          teId: turno.id,
          guardia: guardiaNombre,
          instalacion: turno.installation?.name ?? "—",
          montoClp: Number(turno.amountClp),
          fecha: turno.date.toISOString().slice(0, 10),
          justificacion: turno.amountJustification ?? null,
        },
      });
    } catch (err) {
      console.error("[TE] Error notifying te_created:", err);
    }

    return NextResponse.json({ success: true, data: turno });
  } catch (error) {
    console.error("[TE] Error creating manual turno extra:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el turno extra" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const statusRaw = request.nextUrl.searchParams.get("status") || undefined;
    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const guardiaId = request.nextUrl.searchParams.get("guardiaId") || undefined;
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    const statusFilter = statusRaw
      ? statusRaw.includes(",") ? { in: statusRaw.split(",") } : statusRaw
      : undefined;

    const turnos = await prisma.opsTurnoExtra.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(installationId ? { installationId } : {}),
        ...(guardiaId ? { guardiaId } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
              },
            }
          : {}),
      },
      include: {
        installation: {
          select: { id: true, name: true },
        },
        puesto: {
          select: { id: true, name: true, shiftStart: true, shiftEnd: true },
        },
        guardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        paymentItems: {
          select: {
            id: true,
            loteId: true,
            amountClp: true,
            status: true,
          },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: turnos });
  } catch (error) {
    console.error("[TE] Error listing turnos extra:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los turnos extra" },
      { status: 500 }
    );
  }
}
