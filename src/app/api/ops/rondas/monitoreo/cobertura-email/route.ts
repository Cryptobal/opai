import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import {
  buildCoberturaSnapshot,
  buildCoberturaEmailHtml,
  buildCoberturaChatSummary,
} from "@/lib/rondas/cobertura-email";
import { getOpsChannelId, sendSystemChatMessage } from "@/lib/chat-system-message";

/* ── Simple rate limit: 1 email per 2 min per tenant+turnoFilter ── */
const lastSentMap = new Map<string, number>();
const MIN_INTERVAL_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({})) as {
      turnoFilter?: "nocturno" | "diurno";
    };
    const turnoFilter = body.turnoFilter ?? "nocturno";

    if (turnoFilter !== "nocturno" && turnoFilter !== "diurno") {
      return NextResponse.json(
        { success: false, error: "turnoFilter debe ser 'nocturno' o 'diurno'" },
        { status: 400 },
      );
    }

    // Rate limit per turnoFilter
    const rateKey = `${ctx.tenantId}:${turnoFilter}`;
    const lastSent = lastSentMap.get(rateKey);
    if (lastSent && Date.now() - lastSent < MIN_INTERVAL_MS) {
      return NextResponse.json(
        {
          success: false,
          error: "Espera 2 minutos antes de enviar otro email de cobertura",
        },
        { status: 429 },
      );
    }

    // Find active turno with control nocturno
    const activeTurno = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, status: "active" },
      select: {
        id: true,
        controlNocturnoId: true,
        startedAt: true,
        operatorName: true,
        emailSentTo: true,
      },
    });

    if (!activeTurno?.controlNocturnoId) {
      return NextResponse.json(
        {
          success: false,
          error: "No hay turno activo con grilla de cobertura",
        },
        { status: 400 },
      );
    }

    // Fetch all installations + guards
    const cn = await prisma.opsControlNocturno.findUnique({
      where: { id: activeTurno.controlNocturnoId },
      include: {
        instalaciones: {
          include: {
            guardias: { orderBy: { createdAt: "asc" } },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!cn) {
      return NextResponse.json(
        { success: false, error: "Control nocturno no encontrado" },
        { status: 404 },
      );
    }

    // Build snapshot filtered by turno
    const snapshot = buildCoberturaSnapshot(cn.instalaciones, turnoFilter);

    if (snapshot.instalaciones.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No hay guardias ${turnoFilter === "nocturno" ? "nocturnos" : "diurnos"} registrados`,
        },
        { status: 400 },
      );
    }

    const cfg = await getTenantCompanyConfig(ctx.tenantId);
    const baseUrl =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://opai.gard.cl";

    const html = buildCoberturaEmailHtml(snapshot, {
      operatorName: activeTurno.operatorName ?? "Operador",
      turnoStartedAt: activeTurno.startedAt,
      baseUrl,
    });

    const now = new Date();
    const timeStr = now.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const turnoLabel = turnoFilter === "nocturno" ? "Nocturna" : "Diurna";

    const response = await resend.emails.send({
      from: cfg.emailFrom,
      to: cfg.emailOps || "operaciones@gard.cl",
      replyTo: cfg.emailReplyTo,
      subject: `Cobertura ${turnoLabel} ${timeStr} - Monitoreo`,
      html,
      tags: [{ name: "type", value: "cobertura_snapshot" }],
    });

    if (response.error) {
      console.error("[COBERTURA_EMAIL] Resend error:", response.error);
      return NextResponse.json(
        { success: false, error: "Error enviando email" },
        { status: 500 },
      );
    }

    lastSentMap.set(rateKey, Date.now());

    // Track cobertura send on the turno record (for enforcement before close)
    const coberturaKey = turnoFilter === "nocturno" ? "coberturaNocturnaSentAt" : "coberturaDiurnaSentAt";
    const existingMeta = (activeTurno.emailSentTo ?? {}) as Record<string, unknown>;
    await prisma.opsMonitoreoTurno.update({
      where: { id: activeTurno.id },
      data: {
        emailSentTo: {
          ...existingMeta,
          [coberturaKey]: new Date().toISOString(),
        } as any,
      },
    });

    // Fire-and-forget: send chat message to Operaciones
    (async () => {
      try {
        const channelId = await getOpsChannelId(ctx.tenantId);
        if (!channelId) return;
        const chatSummary = buildCoberturaChatSummary(snapshot);
        await sendSystemChatMessage({
          tenantId: ctx.tenantId,
          channelId,
          content: chatSummary,
          systemEventType: "cobertura_snapshot",
          systemEventData: {
            turnoFilter,
            summary: snapshot.summary,
            operatorName: activeTurno.operatorName,
          },
        });
      } catch (err) {
        console.error("[COBERTURA_EMAIL] chat notification:", err);
      }
    })();

    return NextResponse.json({ success: true, turnoFilter });
  } catch (error) {
    console.error("[COBERTURA_EMAIL] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
