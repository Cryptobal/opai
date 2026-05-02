import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, unauthorized, resolveApiPerms } from '@/lib/api-auth';
import { canView } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hub/rondas-heatmap
 *
 * Heatmap de rondas completadas por instalación × últimos 30 días móviles.
 * Solo cuenta ejecuciones con status = "completada".
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, 'ops', 'rondas')) {
      return NextResponse.json({ success: false, error: 'Sin permisos' }, { status: 403 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Generar lista de los 30 días (oldest → newest)
    const days: { date: Date; label: string; sublabel: string }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      days.push({
        date: d,
        label: String(d.getDate()),
        sublabel: d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', ''),
      });
    }

    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: 'completada',
        scheduledAt: { gte: thirtyDaysAgo, lt: now },
      },
      select: {
        installationId: true,
        scheduledAt: true,
        installation: { select: { id: true, name: true } },
        rondaTemplate: { select: { installation: { select: { id: true, name: true } } } },
      },
    });

    // Agrupar por instalación × día
    const installationMap = new Map<string, { id: string; name: string; counts: Map<string, number> }>();
    for (const e of ejecuciones) {
      const inst = e.installation ?? e.rondaTemplate?.installation;
      if (!inst) continue;
      const dayKey = new Date(e.scheduledAt).toISOString().slice(0, 10);
      if (!installationMap.has(inst.id)) {
        installationMap.set(inst.id, { id: inst.id, name: inst.name, counts: new Map() });
      }
      const entry = installationMap.get(inst.id)!;
      entry.counts.set(dayKey, (entry.counts.get(dayKey) ?? 0) + 1);
    }

    // Sort installations by total desc, top 25
    const installations = Array.from(installationMap.values())
      .map((inst) => {
        const grid = days.map((d) => inst.counts.get(d.date.toISOString().slice(0, 10)) ?? 0);
        const total = grid.reduce((s, v) => s + v, 0);
        return { id: inst.id, name: inst.name, grid, total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 25);

    return NextResponse.json({
      success: true,
      days: days.map((d) => ({ label: d.label, sublabel: d.sublabel })),
      installations,
    });
  } catch (err) {
    console.error('[HUB] rondas-heatmap', err);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
