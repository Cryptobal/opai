import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { resend } from "@/lib/resend";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import {
  buildCoberturaSnapshot,
  buildCoberturaEmailHtml,
} from "@/lib/rondas/cobertura-email";

/* ── Simple rate limit: 1 email per 2 min per tenant ── */
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

    // Rate limit check
    const lastSent = lastSentMap.get(ctx.tenantId);
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

    // Build snapshot and email
    const snapshot = buildCoberturaSnapshot(cn.instalaciones);
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

    const response = await resend.emails.send({
      from: cfg.emailFrom,
      to: cfg.emailOps || "operaciones@gard.cl",
      replyTo: cfg.emailReplyTo,
      subject: `Cobertura ${timeStr} - Monitoreo`,
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

    lastSentMap.set(ctx.tenantId, Date.now());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[COBERTURA_EMAIL] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
