/**
 * One-shot admin endpoint: backfill de ops.ronda_ejecuciones.installation_id
 *
 * Cierra la brecha que impedía al portal cliente ver las rondas programadas
 * por cron (installationId quedaba en null y solo se linkeaba vía
 * rondaTemplate). Ejecuta un UPDATE set-based y reporta totales.
 *
 * Autenticación: Bearer CRON_SECRET (el mismo que usan los crons de Vercel).
 *
 * Uso:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://app.opai.cl/api/admin/backfill-ejecucion-installation?dryRun=1"
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://app.opai.cl/api/admin/backfill-ejecucion-installation"
 *
 * Idempotente: solo toca filas donde installation_id IS NULL.
 * Se puede eliminar el archivo una vez aplicado (queda en git history).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 },
    );
  }

  const isDryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const pendingCount = await prisma.opsRondaEjecucion.count({
      where: { installationId: null, rondaTemplateId: { not: null } },
    });

    if (pendingCount === 0) {
      return NextResponse.json({
        success: true,
        dryRun: isDryRun,
        pendingCount: 0,
        updated: 0,
        remainingNull: 0,
        remainingNullAdhoc: 0,
        message: "Nada que hacer: no hay ejecuciones con installationId null",
      });
    }

    if (isDryRun) {
      const sample = await prisma.opsRondaEjecucion.findMany({
        where: { installationId: null, rondaTemplateId: { not: null } },
        select: {
          tenantId: true,
          rondaTemplate: {
            select: { name: true, installationId: true },
          },
        },
        take: 500,
      });

      let resolvable = 0;
      let unresolvable = 0;
      const byTenantTpl = new Map<string, number>();
      for (const row of sample) {
        if (row.rondaTemplate?.installationId) resolvable++;
        else unresolvable++;
        const key = `${row.tenantId}|${row.rondaTemplate?.name ?? "(sin template)"}`;
        byTenantTpl.set(key, (byTenantTpl.get(key) ?? 0) + 1);
      }

      return NextResponse.json({
        success: true,
        dryRun: true,
        pendingCount,
        sample: {
          size: sample.length,
          resolvable,
          unresolvable,
          byTenantTpl: Object.fromEntries(byTenantTpl),
        },
      });
    }

    const updated = await prisma.$executeRawUnsafe(`
      UPDATE ops.ronda_ejecuciones AS e
         SET installation_id = rt.installation_id
        FROM ops.ronda_templates AS rt
       WHERE e.ronda_template_id = rt.id
         AND e.installation_id IS NULL
         AND rt.installation_id IS NOT NULL;
    `);

    const [remainingNull, remainingNullAdhoc] = await Promise.all([
      prisma.opsRondaEjecucion.count({ where: { installationId: null } }),
      prisma.opsRondaEjecucion.count({
        where: { installationId: null, isAdHoc: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      dryRun: false,
      pendingCount,
      updated,
      remainingNull,
      remainingNullAdhoc,
    });
  } catch (err: any) {
    console.error("[admin-backfill-ejecucion-installation] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message ?? "Error interno" },
      { status: 500 },
    );
  }
}
