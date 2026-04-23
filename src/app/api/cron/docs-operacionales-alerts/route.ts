/**
 * API Route: /api/cron/docs-operacionales-alerts
 * GET - Verifica documentos operacionales próximos a vencer o vencidos
 * y crea notificaciones (bell + email) usando `sendNotification`.
 *
 * Cubre documentos globales (capa="global") y por instalación (capa="instalacion").
 * Respeta `tipo.diasAlerta` como ventana de alerta.
 *
 * Corre diariamente vía Vercel Cron. Protegido con CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, format } from "date-fns";
import { sendNotification } from "@/lib/notification-service";
import { calcDocStatus } from "@/lib/docs-operacionales";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    let expiringCreated = 0;
    let expiredCreated = 0;
    let skipped = 0;
    let statusUpdates = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const result = await processTenant(tenant.id);
        expiringCreated += result.expiringCreated;
        expiredCreated += result.expiredCreated;
        skipped += result.skipped;
        statusUpdates += result.statusUpdates;
      } catch (err) {
        errors++;
        console.error(`[docs-operacionales-alerts] Error for tenant ${tenant.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      tenants: tenants.length,
      expiringCreated,
      expiredCreated,
      skipped,
      statusUpdates,
      errors,
    });
  } catch (error) {
    console.error("[docs-operacionales-alerts] Fatal error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function processTenant(tenantId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Traemos todos los docs operacionales del tenant cuyo tipo tiene vencimiento
  // y que aún no están marcados como "no_aplica" (defensivo — evita reprocesar perpetuos).
  const docs = await prisma.docOperacional.findMany({
    where: {
      tenantId,
      expiresAt: { not: null },
      tipo: { tieneVencimiento: true, isActive: true },
    },
    include: {
      tipo: { select: { nombre: true, tieneVencimiento: true, diasAlerta: true } },
      installation: { select: { id: true, name: true } },
    },
    take: 500,
  });

  let expiringCreated = 0;
  let expiredCreated = 0;
  let skipped = 0;
  let statusUpdates = 0;

  for (const doc of docs) {
    if (!doc.expiresAt) continue;

    const expiresAt = new Date(doc.expiresAt);
    const daysRemaining = Math.ceil(
      (expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const alertDays = doc.tipo.diasAlerta ?? 30;

    // Actualiza el status DB si diverge del cálculo actual (defensa vs. cron de status no programado)
    const computed = calcDocStatus(expiresAt, doc.tipo.tieneVencimiento, alertDays);
    if (computed !== doc.status) {
      await prisma.docOperacional.update({
        where: { id: doc.id },
        data: { status: computed },
      });
      statusUpdates++;
    }

    const ubicacion = doc.installation?.name ?? "Global";
    const dueText =
      daysRemaining < 0
        ? `venció el ${format(expiresAt, "dd/MM/yyyy")}`
        : daysRemaining === 0
          ? `vence hoy (${format(expiresAt, "dd/MM/yyyy")})`
          : `vence en ${daysRemaining} día(s) el ${format(expiresAt, "dd/MM/yyyy")}`;

    if (daysRemaining < 0) {
      // Vencido
      const existing = await prisma.notification.findFirst({
        where: {
          tenantId,
          type: "doc_operacional_expired",
          data: { path: ["docOperacionalId"], equals: doc.id },
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await sendNotification({
        tenantId,
        type: "doc_operacional_expired",
        title: `Documento vencido: ${doc.tipo.nombre}`,
        message: `${doc.tipo.nombre} (${ubicacion}) ${dueText}. Requiere renovación.`,
        link: doc.installationId
          ? `/opai/documentos-operativos`
          : `/opai/configuracion/documentos-operacionales`,
        data: {
          docOperacionalId: doc.id,
          tipoId: doc.tipoId,
          installationId: doc.installationId,
          expiresAt: doc.expiresAt,
        },
      });
      expiredCreated++;
    } else if (daysRemaining <= alertDays) {
      // Por vencer — dedup por ventana de 24h para poder re-avisar en los días finales
      const existing = await prisma.notification.findFirst({
        where: {
          tenantId,
          type: "doc_operacional_expiring",
          data: { path: ["docOperacionalId"], equals: doc.id },
          createdAt: { gte: addDays(today, -1) },
        },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      await sendNotification({
        tenantId,
        type: "doc_operacional_expiring",
        title: `Documento por vencer: ${doc.tipo.nombre}`,
        message: `${doc.tipo.nombre} (${ubicacion}) ${dueText}.`,
        link: doc.installationId
          ? `/opai/documentos-operativos`
          : `/opai/configuracion/documentos-operacionales`,
        data: {
          docOperacionalId: doc.id,
          tipoId: doc.tipoId,
          installationId: doc.installationId,
          expiresAt: doc.expiresAt,
          daysRemaining,
        },
      });
      expiringCreated++;
    }
  }

  return { expiringCreated, expiredCreated, skipped, statusUpdates };
}
