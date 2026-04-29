import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, unauthorized, resolveApiPerms } from '@/lib/api-auth';
import { canView } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hub/installations-health
 *
 * Top 5 instalaciones con peor health score.
 * Si no hay registros, devuelve lista vacía.
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, 'ops', 'supervision')) {
      return NextResponse.json({ success: false, error: 'Sin permisos' }, { status: 403 });
    }

    const scores = await prisma.opsInstallationHealthScore.findMany({
      where: {
        tenantId: ctx.tenantId,
        installation: { status: 'active' },
      },
      select: {
        installationId: true,
        score: true,
        avgRating: true,
        daysSinceLastVisit: true,
        openFindingsCount: true,
        overdueFindingsCount: true,
        lastDotationCompliance: true,
        lastChecklistCompliance: true,
        installation: { select: { id: true, name: true } },
      },
      orderBy: { score: 'asc' },
      take: 5,
    });

    return NextResponse.json({
      success: true,
      installations: scores.map((s) => ({
        id: s.installation.id,
        name: s.installation.name,
        score: s.score,
        avgRating: s.avgRating ? Number(s.avgRating) : null,
        daysSinceLastVisit: s.daysSinceLastVisit,
        openFindingsCount: s.openFindingsCount,
        overdueFindingsCount: s.overdueFindingsCount,
        dotationCompliance: s.lastDotationCompliance ? Number(s.lastDotationCompliance) : null,
        checklistCompliance: s.lastChecklistCompliance ? Number(s.lastChecklistCompliance) : null,
      })),
    });
  } catch (err) {
    console.error('[HUB] installations-health', err);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
