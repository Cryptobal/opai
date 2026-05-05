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
import { requireTenantModule } from '@/lib/require-module';
import { getEmailBaseUrl } from "@/lib/emails/site-url";

/* ── Simple rate limit: 1 email per 2 min per tenant+turnoFilter ── */
const lastSentMap = new Map<string, number>();
const MIN_INTERVAL_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  const modCheck = await requireTenantModule('ops_rondas');
  if (!modCheck.authorized) return modCheck.response;

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
      confirmResend?: boolean;
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

    // Check if this cobertura type was already sent for this turno
    const meta = (activeTurno.emailSentTo ?? {}) as Record<string, unknown>;
    const cobKey = turnoFilter === "nocturno" ? "coberturaNocturnaSentAt" : "coberturaDiurnaSentAt";
    if (meta[cobKey] && !body.confirmResend) {
      const label = turnoFilter === "nocturno" ? "nocturna" : "diurna";
      return NextResponse.json(
        {
          success: false,
          alreadySent: true,
          error: `La cobertura ${label} ya fue enviada para este turno`,
        },
        { status: 409 },
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

    // Query pauta mensual to get planned shift times per guard
    const shiftMap = new Map<string, string>();
    try {
      const pautas = await prisma.opsPautaMensual.findMany({
        where: {
          tenantId: ctx.tenantId,
          date: cn.date,
          shiftCode: "T",
          OR: [
            { plannedGuardiaId: { not: null } },
            { replacementGuardiaId: { not: null } },
          ],
        },
        select: {
          plannedGuardiaId: true,
          replacementGuardiaId: true,
          puesto: { select: { shiftStart: true } },
        },
      });
      for (const p of pautas) {
        const gId = p.replacementGuardiaId ?? p.plannedGuardiaId;
        if (gId && p.puesto?.shiftStart) {
          shiftMap.set(gId, p.puesto.shiftStart);
        }
      }
    } catch (err) {
      console.error("[COBERTURA_EMAIL] Failed to fetch pauta shift data:", err);
    }

    // Query asistencia diaria to enrich guard status from attendance records
    const asistenciaMap = new Map<string, { checkInAt: Date }>();
    try {
      const asistencia = await prisma.opsAsistenciaDiaria.findMany({
        where: {
          tenantId: ctx.tenantId,
          date: cn.date,
          attendanceStatus: { in: ["asistio", "reemplazo"] },
          checkInAt: { not: null },
          deletedAt: null,
        },
        select: {
          plannedGuardiaId: true,
          actualGuardiaId: true,
          replacementGuardiaId: true,
          checkInAt: true,
        },
      });
      for (const a of asistencia) {
        const gId = a.actualGuardiaId ?? a.replacementGuardiaId ?? a.plannedGuardiaId;
        if (gId && a.checkInAt) {
          asistenciaMap.set(gId, { checkInAt: a.checkInAt });
        }
      }
    } catch (err) {
      console.error("[COBERTURA_EMAIL] Failed to fetch asistencia data:", err);
    }

    // Build snapshot filtered by turno
    const snapshot = buildCoberturaSnapshot(cn.instalaciones, turnoFilter, shiftMap, asistenciaMap);

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
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { slug: true },
    });
    const tenantSlug = tenant?.slug ?? null;
    const baseUrl = getEmailBaseUrl(request.headers.get("origin"), tenantSlug);

    const html = buildCoberturaEmailHtml(snapshot, {
      operatorName: activeTurno.operatorName ?? "Operador",
      turnoStartedAt: activeTurno.startedAt,
      baseUrl,
      tenantSlug,
    });

    const now = new Date();
    const timeStr = now.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Santiago",
    });
    const turnoLabel = turnoFilter === "nocturno" ? "Nocturna" : "Diurna";

    const response = await resend.emails.send({
      from: cfg.emailFrom,
      to: cfg.emailOps,
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
