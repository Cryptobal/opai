/**
 * GET /api/personas/conocimiento/installations/[id]/dispatch-history
 *
 * Devuelve dos colecciones para la pestaña "Envíos automáticos" del detalle:
 *   - upcoming: por examen recurrente activo y por guardia activo, calcula
 *     la próxima fecha estimada de envío usando `resolveRecurringDays` +
 *     KnowledgeConfig del tenant.
 *   - runs: últimas N corridas del cron (`ExamRecurringDispatchRun`) que
 *     hayan tocado al menos un examen de esta instalación.
 *
 * Auth: requiere `canView(perms, "ops", "guardias")` — mismo gate que el
 * detalle de la instalación (ver `[id]/route.ts`).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getKnowledgeConfig, resolveRecurringDays } from "@/lib/knowledge/config";

export const dynamic = "force-dynamic";

type Params = { id: string };

const RUNS_LIMIT = 50;
const UPCOMING_LIMIT = 100;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "guardias")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id: installationId } = await params;
    const cfg = await getKnowledgeConfig(ctx.tenantId);

    // ── upcoming: calcular próxima fecha estimada por (examen, guardia) ──
    const exams = await prisma.exam.findMany({
      where: {
        installationId,
        installation: { tenantId: ctx.tenantId },
        status: "active",
        scheduleType: "recurring",
      },
      select: {
        id: true,
        title: true,
        recurringDays: true,
        recurringMonths: true,
        assignments: {
          select: {
            guardId: true,
            sentAt: true,
            completedAt: true,
            status: true,
            guard: {
              select: {
                persona: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: [{ completedAt: "desc" }, { sentAt: "desc" }],
        },
      },
    });

    const now = Date.now();
    const upcoming: Array<{
      examId: string;
      examTitle: string;
      guardId: string;
      guardName: string;
      nextDispatchAt: string;
      daysUntil: number;
    }> = [];

    for (const exam of exams) {
      const days = resolveRecurringDays(exam, cfg.recurringDefaultDays);
      if (days <= 0) continue;
      const seen = new Set<string>();
      for (const a of exam.assignments) {
        if (seen.has(a.guardId)) continue;
        seen.add(a.guardId);
        const reference = a.completedAt ?? a.sentAt;
        const next = new Date(reference.getTime() + days * 24 * 60 * 60 * 1000);
        const daysUntil = Math.ceil((next.getTime() - now) / (24 * 60 * 60 * 1000));
        upcoming.push({
          examId: exam.id,
          examTitle: exam.title,
          guardId: a.guardId,
          guardName: `${a.guard.persona.firstName ?? ""} ${a.guard.persona.lastName ?? ""}`.trim(),
          nextDispatchAt: next.toISOString(),
          daysUntil,
        });
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    // ── runs: últimas N corridas relevantes ──
    const runsRaw = await prisma.examRecurringDispatchRun.findMany({
      where: {
        tenantId: ctx.tenantId,
        assignments: { some: { exam: { installationId } } },
      },
      orderBy: { startedAt: "desc" },
      take: RUNS_LIMIT,
      select: {
        id: true,
        startedAt: true,
        finishedAt: true,
        examsProcessed: true,
        assignmentsCreated: true,
        emailsSent: true,
        emailsFailed: true,
        emailsSkipped: true,
        triggerSource: true,
      },
    });

    const runs = runsRaw.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      examsProcessed: r.examsProcessed,
      assignmentsCreated: r.assignmentsCreated,
      emailsSent: r.emailsSent,
      emailsFailed: r.emailsFailed,
      emailsSkipped: r.emailsSkipped,
      triggerSource: r.triggerSource,
    }));

    return NextResponse.json({
      success: true,
      data: {
        upcoming: upcoming.slice(0, UPCOMING_LIMIT),
        runs,
      },
    });
  } catch (err) {
    console.error("[knowledge/dispatch-history]", err);
    return NextResponse.json(
      { success: false, error: "Error obteniendo el historial" },
      { status: 500 },
    );
  }
}
