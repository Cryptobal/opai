import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { getPusherServer } from "@/lib/chat";
import { requireTenantModule } from '@/lib/require-module';

export async function PUT(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rondas_resolve_alerts")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const now = new Date();

    // Fetch alert for response time calculation and type check
    const alerta = await prisma.opsAlertaRonda.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { createdAt: true, tipo: true },
    });

    if (!alerta) {
      return NextResponse.json({ success: false, error: "Alerta no encontrada" }, { status: 404 });
    }

    // Panic alerts cannot be acknowledged — they MUST be resolved with notes via /resolve
    if (alerta.tipo === "panico") {
      return NextResponse.json(
        { success: false, error: "Las alertas de pánico no se pueden cerrar sin escribir qué pasó. Usa resolver con notas." },
        { status: 400 },
      );
    }

    const result = await prisma.opsAlertaRonda.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: { isAcknowledged: true, acknowledgedBy: ctx.userId, acknowledgedAt: now },
    });
    if (!result.count) {
      return NextResponse.json({ success: false, error: "Alerta no encontrada" }, { status: 404 });
    }

    // Create audit log
    await prisma.opsAlertaLog.create({
      data: {
        alertaId: id,
        tenantId: ctx.tenantId,
        action: "acknowledged",
        userId: ctx.userId,
        userName: ctx.userEmail,
        metadata: {
          tiempoRespuesta: alerta?.createdAt
            ? Math.round((now.getTime() - new Date(alerta.createdAt).getTime()) / 1000)
            : null,
        },
      },
    });

    const updated = await prisma.opsAlertaRonda.findFirst({ where: { id, tenantId: ctx.tenantId } });

    // Trigger Pusher events for real-time feedback
    if (updated) {
      try {
        const pusher = getPusherServer();
        const channel = `monitoreo-${ctx.tenantId}`;
        await Promise.all([
          pusher.trigger(channel, "panico-atendido", {
            alertaId: updated.id,
            guardiaId: updated.guardiaId,
          }),
          pusher.trigger(channel, "panic-resolved", {
            alertaId: updated.id,
          }),
        ]);
      } catch (pusherErr) {
        console.error("[RONDAS] Pusher trigger on acknowledge failed:", pusherErr);
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[RONDAS] PUT acknowledge", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
