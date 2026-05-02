import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, unauthorized, resolveApiPerms } from '@/lib/api-auth';
import { canView } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/hub/conocimiento-heatmap
 *
 * Foto actual del conocimiento por instalación.
 * - Solo guardias con currentInstallationId asignado.
 * - Para cada guardia, su ÚLTIMA nota completada (último ExamAssignment con status="completed").
 * - Por instalación: promedio + distribución (<60, 60-80, >80, sin examen).
 * - Orden: peor promedio arriba.
 */
export async function GET(_req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, 'ops', 'guardias')) {
      return NextResponse.json({ success: false, error: 'Sin permisos' }, { status: 403 });
    }

    // 1. Guardias activos con instalación
    const guardias = await prisma.opsGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        currentInstallationId: { not: null },
      },
      select: {
        id: true,
        currentInstallationId: true,
        currentInstallation: { select: { id: true, name: true } },
      },
    });

    if (guardias.length === 0) {
      return NextResponse.json({ success: true, installations: [] });
    }

    const guardIds = guardias.map((g) => g.id);

    // 2. Última nota completada por guardia
    const completedAssignments = await prisma.examAssignment.findMany({
      where: {
        guardId: { in: guardIds },
        status: 'completed',
        score: { not: null },
      },
      select: {
        guardId: true,
        score: true,
        completedAt: true,
      },
      orderBy: { completedAt: 'desc' },
    });

    // Take latest per guard
    const lastScoreByGuard = new Map<string, number>();
    for (const a of completedAssignments) {
      if (!lastScoreByGuard.has(a.guardId) && a.score != null) {
        lastScoreByGuard.set(a.guardId, Number(a.score));
      }
    }

    // 3. Aggregate by installation
    type InstAgg = {
      id: string;
      name: string;
      total: number;
      withScore: number;
      sumScore: number;
      below60: number;
      between60_80: number;
      above80: number;
      withoutExam: number;
    };
    const map = new Map<string, InstAgg>();
    for (const g of guardias) {
      const inst = g.currentInstallation;
      if (!inst) continue;
      if (!map.has(inst.id)) {
        map.set(inst.id, {
          id: inst.id, name: inst.name, total: 0, withScore: 0, sumScore: 0,
          below60: 0, between60_80: 0, above80: 0, withoutExam: 0,
        });
      }
      const entry = map.get(inst.id)!;
      entry.total += 1;
      const score = lastScoreByGuard.get(g.id);
      if (score == null) {
        entry.withoutExam += 1;
      } else {
        entry.withScore += 1;
        entry.sumScore += score;
        if (score < 60) entry.below60 += 1;
        else if (score <= 80) entry.between60_80 += 1;
        else entry.above80 += 1;
      }
    }

    const rows = Array.from(map.values())
      .filter((r) => r.total > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        total: r.total,
        avg: r.withScore > 0 ? Math.round(r.sumScore / r.withScore) : null,
        below60: r.below60,
        between60_80: r.between60_80,
        above80: r.above80,
        withoutExam: r.withoutExam,
      }))
      // Peor promedio arriba; los sin nota van al final
      .sort((a, b) => {
        if (a.avg == null && b.avg == null) return b.total - a.total;
        if (a.avg == null) return 1;
        if (b.avg == null) return -1;
        return a.avg - b.avg;
      });

    return NextResponse.json({ success: true, installations: rows });
  } catch (err) {
    console.error('[HUB] conocimiento-heatmap', err);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
