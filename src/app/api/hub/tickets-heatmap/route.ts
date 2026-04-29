import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, unauthorized, resolveApiPerms } from '@/lib/api-auth';
import { canView } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const ACTIVE = ['open', 'in_progress', 'waiting', 'pending_approval'];

/**
 * GET /api/hub/tickets-heatmap
 *
 * Matriz de tickets ACTIVOS por instalación × prioridad/SLA.
 * Columnas: Total, P1, P2, P3, P4, SLA vencido.
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, 'ops', 'tickets')) {
      return NextResponse.json({ success: false, error: 'Sin permisos' }, { status: 403 });
    }

    const tickets = await prisma.opsTicket.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ACTIVE },
      },
      select: {
        installationId: true,
        priority: true,
        slaBreached: true,
      },
    });

    if (tickets.length === 0) {
      return NextResponse.json({ success: true, installations: [] });
    }

    // Get installation names
    const installationIds = [...new Set(tickets.map((t) => t.installationId).filter(Boolean))] as string[];
    const installations = installationIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { id: { in: installationIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(installations.map((i) => [i.id, i.name]));

    // Aggregate
    const map = new Map<string, { total: number; p1: number; p2: number; p3: number; p4: number; breached: number }>();
    for (const t of tickets) {
      const key = t.installationId ?? '__none__';
      if (!map.has(key)) map.set(key, { total: 0, p1: 0, p2: 0, p3: 0, p4: 0, breached: 0 });
      const e = map.get(key)!;
      e.total += 1;
      if (t.priority === 'p1') e.p1 += 1;
      else if (t.priority === 'p2') e.p2 += 1;
      else if (t.priority === 'p3') e.p3 += 1;
      else if (t.priority === 'p4') e.p4 += 1;
      if (t.slaBreached) e.breached += 1;
    }

    const rows = Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        name: id === '__none__' ? 'Sin instalación' : (nameById.get(id) ?? 'Desconocida'),
        total: v.total,
        p1: v.p1,
        p2: v.p2,
        p3: v.p3,
        p4: v.p4,
        breached: v.breached,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    return NextResponse.json({ success: true, installations: rows });
  } catch (err) {
    console.error('[HUB] tickets-heatmap', err);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
