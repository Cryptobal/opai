/**
 * GET /api/cron/sync-asignaciones-vigencia
 *
 * Aplica en la fecha efectiva los efectos diferidos de traslados y finiquitos:
 * - lifecycleStatus → inactivo cuando terminatedAt < hoy Chile
 * - currentInstallationId según la asignación vigente hoy
 *
 * Idempotente. Auth: Authorization: Bearer ${CRON_SECRET}
 * Registrado en vercel.json: "15 4 * * *" (00:15/01:15 Chile).
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { toISODate } from "@/lib/ops";
import {
  addDays,
  hoyChileDate,
  resolveVigente,
} from "@/lib/ops/asignacion-vigencia";
import { syncGuardiaInstallationRefs } from "@/lib/docs/sync-instalacion-refs";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hoy = hoyChileDate();
  const hoyStr = toISODate(hoy);
  const windowStart = addDays(hoy, -3);

  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true },
  });

  let inactivated = 0;
  let installationUpdated = 0;
  let installationCleared = 0;

  for (const tenant of tenants) {
    const pendingFiniquitos = await prisma.opsGuardia.findMany({
      where: {
        tenantId: tenant.id,
        lifecycleStatus: { in: ["contratado", "seleccionado"] },
        terminatedAt: { lt: hoy },
      },
      select: { id: true, lifecycleStatus: true, terminatedAt: true },
    });

    for (const g of pendingFiniquitos) {
      await prisma.opsGuardia.update({
        where: { id: g.id },
        data: { lifecycleStatus: "inactivo" },
      });
      await prisma.opsGuardiaHistory.create({
        data: {
          tenantId: tenant.id,
          guardiaId: g.id,
          eventType: "lifecycle_changed",
          previousValue: { lifecycleStatus: g.lifecycleStatus },
          newValue: {
            lifecycleStatus: "inactivo",
            from: g.lifecycleStatus,
            to: "inactivo",
          },
          reason: `Finiquito efectivo ${g.terminatedAt ? toISODate(g.terminatedAt) : hoyStr}`,
          createdBy: "cron",
        },
      });
      inactivated += 1;
    }

    const windowAsignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { startDate: { gte: windowStart, lte: hoy } },
          { endDate: { gte: windowStart, lte: hoy } },
        ],
      },
      select: { guardiaId: true },
    });
    const guardiaIds = [...new Set(windowAsignaciones.map((a) => a.guardiaId))];
    if (guardiaIds.length === 0) continue;

    const [guardias, asignaciones] = await Promise.all([
      prisma.opsGuardia.findMany({
        where: { tenantId: tenant.id, id: { in: guardiaIds } },
        select: { id: true, currentInstallationId: true },
      }),
      prisma.opsAsignacionGuardia.findMany({
        where: { tenantId: tenant.id, guardiaId: { in: guardiaIds } },
        select: {
          guardiaId: true,
          startDate: true,
          endDate: true,
          installationId: true,
          createdAt: true,
        },
      }),
    ]);

    const byGuardia = new Map<string, typeof asignaciones>();
    for (const a of asignaciones) {
      const list = byGuardia.get(a.guardiaId) ?? [];
      list.push(a);
      byGuardia.set(a.guardiaId, list);
    }

    for (const g of guardias) {
      const vigente = resolveVigente(byGuardia.get(g.id) ?? [], hoy);
      const desired = vigente?.installationId ?? null;
      if (g.currentInstallationId === desired) continue;

      await prisma.opsGuardia.update({
        where: { id: g.id },
        data: { currentInstallationId: desired },
      });
      await syncGuardiaInstallationRefs(tenant.id, g.id, desired);
      if (desired) installationUpdated += 1;
      else installationCleared += 1;
    }
  }

  console.info("[OPS][CRON] sync-asignaciones-vigencia", {
    hoy: hoyStr,
    tenants: tenants.length,
    inactivated,
    installationUpdated,
    installationCleared,
  });

  return NextResponse.json({
    success: true,
    hoy: hoyStr,
    tenants: tenants.length,
    inactivated,
    installationUpdated,
    installationCleared,
  });
}
