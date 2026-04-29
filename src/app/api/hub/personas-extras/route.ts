import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, unauthorized, resolveApiPerms } from '@/lib/api-auth';
import { canView } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hub/personas-extras
 *
 * - Postulantes nuevos esta semana + delta vs semana anterior.
 * - Cumpleaños de la semana (próximos 7 días) de guardias activos.
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, 'ops', 'guardias')) {
      return NextResponse.json({ success: false, error: 'Sin permisos' }, { status: 403 });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [thisWeek, prevWeek, totalActive] = await Promise.all([
      prisma.atsApplication.count({
        where: { tenantId: ctx.tenantId, createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.atsApplication.count({
        where: { tenantId: ctx.tenantId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      }),
      prisma.atsApplication.count({
        where: { tenantId: ctx.tenantId, etapa: { not: 'POSTULADO' } },
      }),
    ]);

    // Delta % (guard against div by 0)
    const delta = prevWeek === 0
      ? (thisWeek > 0 ? 100 : 0)
      : Math.round(((thisWeek - prevWeek) / prevWeek) * 100);

    // Cumpleaños — guardias activos con birthDate cuyos cumple cae en próximos 7 días
    const guardiasConCumple = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        currentInstallationId: { not: null },
        persona: { birthDate: { not: null } },
      },
      select: {
        id: true,
        persona: { select: { firstName: true, lastName: true, birthDate: true } },
        currentInstallation: { select: { id: true, name: true } },
      },
    });

    const cumples = guardiasConCumple
      .map((g) => {
        const bd = g.persona?.birthDate;
        if (!bd) return null;
        // Calcular el próximo cumpleaños desde hoy
        const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
        const nextYear = new Date(now.getFullYear() + 1, bd.getMonth(), bd.getDate());
        const upcoming = thisYear >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? thisYear : nextYear;
        if (upcoming > sevenDaysAhead) return null;
        return {
          guardiaId: g.id,
          name: `${g.persona?.firstName ?? ''} ${g.persona?.lastName ?? ''}`.trim(),
          installationId: g.currentInstallation?.id ?? null,
          installationName: g.currentInstallation?.name ?? null,
          date: upcoming.toISOString().slice(0, 10),
          age: upcoming.getFullYear() - bd.getFullYear(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      success: true,
      postulantes: {
        thisWeek,
        prevWeek,
        delta,
        inProcess: totalActive,
      },
      cumples,
    });
  } catch (err) {
    console.error('[HUB] personas-extras', err);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
