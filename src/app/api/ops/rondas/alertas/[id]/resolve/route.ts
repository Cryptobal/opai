import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { getPusherServer } from "@/lib/chat";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rondas_resolve_alerts")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const resolutionNotes = typeof body?.resolutionNotes === "string"
      ? body.resolutionNotes.trim().slice(0, 1000)
      : null;

    // Fetch alert to check type and calculate response time
    const alerta = await prisma.opsAlertaRonda.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { tipo: true, createdAt: true },
    });

    if (!alerta) {
      return NextResponse.json({ success: false, error: "Alerta no encontrada" }, { status: 404 });
    }

    // For panic alerts, resolutionNotes is REQUIRED (min 10 chars)
    if (alerta.tipo === "panico" && (!resolutionNotes || resolutionNotes.length < 10)) {
      return NextResponse.json(
        { success: false, error: "Las alertas de pánico requieren un comentario de resolución de al menos 10 caracteres" },
        { status: 400 },
      );
    }

    const now = new Date();

    // Resolve + create audit log in a transaction
    const [result] = await prisma.$transaction([
      prisma.opsAlertaRonda.updateMany({
        where: { id, tenantId: ctx.tenantId },
        data: {
          resuelta: true,
          resueltaPor: ctx.userId,
          resueltaAt: now,
          resolutionNotes: resolutionNotes ?? undefined,
        },
      }),
      prisma.opsAlertaLog.create({
        data: {
          alertaId: id,
          tenantId: ctx.tenantId,
          action: "resolved",
          userId: ctx.userId,
          userName: ctx.userEmail,
          notes: resolutionNotes,
          metadata: {
            tiempoRespuesta: alerta.createdAt
              ? Math.round((now.getTime() - new Date(alerta.createdAt).getTime()) / 1000)
              : null,
          },
        },
      }),
    ]);

    if (!result.count) {
      return NextResponse.json({ success: false, error: "Alerta no encontrada" }, { status: 404 });
    }

    const updated = await prisma.opsAlertaRonda.findFirst({ where: { id, tenantId: ctx.tenantId } });

    // For panic alerts, trigger Pusher so ALL users stop the alarm
    if (alerta.tipo === "panico" && updated) {
      try {
        const pusher = getPusherServer();
        const channel = `monitoreo-${ctx.tenantId}`;
        await pusher.trigger(channel, "panic-resolved", { alertaId: updated.id });
      } catch (pusherErr) {
        console.error("[RONDAS] Pusher trigger on resolve failed:", pusherErr);
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[RONDAS] PUT resolve", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
