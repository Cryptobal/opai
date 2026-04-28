/**
 * Shared aggregator for the "Personas → Conocimiento" module.
 *
 * Centralizes how we compute installation-level / guard-level compliance
 * from the existing `protocol_*` and `exam_*` tables, so the operator
 * pages, the portal cliente sub-tab and the PDF report all return
 * consistent numbers.
 *
 * Pure-data layer: NO React, NO Next.js. All multi-tenancy is enforced
 * by the caller passing `tenantId`.
 */

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import type {
  GuardSectionScores,
  GuardStatus,
  InstallationDetailAlert,
  InstallationDetailGuard,
  InstallationDetailMonthlyAvg,
  InstallationDetailResult,
  InstallationDetailSectionCompliance,
  InstallationStatus,
  OverviewFilters,
  OverviewInstallation,
  OverviewKpis,
  OverviewResult,
  Trend,
} from "./knowledge-aggregator-types";

export type {
  GuardSectionScores,
  GuardStatus,
  InstallationDetailAlert,
  InstallationDetailGuard,
  InstallationDetailMonthlyAvg,
  InstallationDetailResult,
  InstallationDetailSectionCompliance,
  InstallationStatus,
  OverviewFilters,
  OverviewInstallation,
  OverviewKpis,
  OverviewResult,
  Trend,
};

/* ─────────── status classifiers ─────────── */

export function classifyInstallationStatus(input: {
  hasProtocol: boolean;
  evaluatedGuards: number;
  avgScore: number | null;
  failedCount: number;
}): InstallationStatus {
  if (!input.hasProtocol) return "no_protocol";
  if (input.evaluatedGuards === 0) return "no_evaluated";
  if (input.avgScore !== null && (input.avgScore < 60 || input.failedCount > 0)) {
    return "critical";
  }
  if (input.avgScore !== null && input.avgScore >= 60 && input.avgScore < 80) {
    return "warning";
  }
  return "ok";
}

export function classifyGuard(input: {
  completed: number;
  pending: number;
  avgScore: number | null;
  passingScore: number;
}): GuardStatus {
  if (input.pending > 0 && input.completed === 0) return "pending";
  if (input.completed === 0) return "unevaluated";
  if (input.avgScore == null) return "unevaluated";
  if (input.avgScore >= 80) return "approved";
  if (input.avgScore >= input.passingScore) return "borderline";
  return "failed";
}

export function computeTrend(
  scoresByMonth: Array<{ month: string; avg: number }>,
): Trend {
  if (scoresByMonth.length < 2) return null;
  const sorted = [...scoresByMonth].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1].avg;
  const prev = sorted[sorted.length - 2].avg;
  const diff = last - prev;
  if (diff > 1) return "up";
  if (diff < -1) return "down";
  return "stable";
}

/* ─────────── anonymization ─────────── */

export function anonymizeGuard(
  name: string,
  guardId: string,
  salt: string,
): { initials: string; opaqueId: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0]?.toUpperCase() ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0]?.toUpperCase() : "";
  const initials = last ? `${first}. ${last}.` : `${first}.`;
  const hash = crypto
    .createHash("sha256")
    .update(`${guardId}:${salt}`)
    .digest("hex")
    .slice(0, 12);
  return { initials, opaqueId: `g_${hash}` };
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0]?.toUpperCase() ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0]?.toUpperCase() : "";
  return last ? `${first}${last}` : first;
}

/* ─────────── per-section scoring per guard ─────────── */

/**
 * Given an array of completed assignments (with `answers` JSON and exam
 * questions), build a `Record<sectionId, percent>` for a single guard.
 *
 * `answers` schema (from existing flow): array of selected option indexes
 * keyed by question index (matching the `questions` array order).
 */
export function computeGuardSectionScores(
  completedAssignments: Array<{
    answers: unknown;
    exam: {
      questions: Array<{
        id: string;
        correctAnswer: number;
        sectionRef: string | null;
        order: number;
      }>;
    };
  }>,
  knownSectionIds: Set<string>,
): GuardSectionScores {
  const stats = new Map<string, { correct: number; total: number }>();

  for (const a of completedAssignments) {
    const ans = parseAnswers(a.answers);
    if (!ans) continue;
    const orderedQ = [...a.exam.questions].sort((x, y) => x.order - y.order);
    orderedQ.forEach((q, idx) => {
      if (!q.sectionRef) return;
      if (!knownSectionIds.has(q.sectionRef)) return;
      const got = ans[idx];
      if (got === undefined || got === null) return;
      const e = stats.get(q.sectionRef) ?? { correct: 0, total: 0 };
      e.total += 1;
      if (Number(got) === q.correctAnswer) e.correct += 1;
      stats.set(q.sectionRef, e);
    });
  }

  const result: GuardSectionScores = {};
  for (const id of knownSectionIds) {
    const e = stats.get(id);
    result[id] = e && e.total > 0 ? Math.round((e.correct / e.total) * 100) : null;
  }
  return result;
}

function parseAnswers(raw: unknown): Record<number, number> | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const obj: Record<number, number> = {};
    raw.forEach((v, i) => {
      if (typeof v === "number") obj[i] = v;
    });
    return obj;
  }
  if (typeof raw === "object") {
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const idx = Number(k);
      if (Number.isFinite(idx) && typeof v === "number") out[idx] = v;
    }
    return out;
  }
  return null;
}

/* ─────────── overview (cross-installation grid) ─────────── */

const OVERVIEW_TTL_MS = 60_000;
const overviewCache = new Map<string, { data: OverviewResult; ts: number }>();

export function clearKnowledgeCache(tenantId?: string): void {
  if (tenantId) overviewCache.delete(tenantId);
  else overviewCache.clear();
}

export async function buildOverview(
  tenantId: string,
  filters: OverviewFilters = {},
): Promise<OverviewResult> {
  const cached = overviewCache.get(tenantId);
  let base: OverviewResult;
  if (cached && Date.now() - cached.ts < OVERVIEW_TTL_MS) {
    base = cached.data;
  } else {
    base = await computeOverview(tenantId);
    overviewCache.set(tenantId, { data: base, ts: Date.now() });
  }

  let installations = base.installations;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    installations = installations.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.accountName ?? "").toLowerCase().includes(q),
    );
  }
  if (filters.status && filters.status !== "all") {
    installations = installations.filter((i) => i.status === filters.status);
  }
  if (filters.order) {
    const asc = filters.order === "score_asc";
    const cmp: Record<string, (a: OverviewInstallation, b: OverviewInstallation) => number> = {
      score_asc: (a, b) => (a.avgScore ?? -1) - (b.avgScore ?? -1),
      score_desc: (a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1),
      name: (a, b) => a.name.localeCompare(b.name),
      lastExam: (a, b) =>
        (b.lastExamAt ?? "").localeCompare(a.lastExamAt ?? ""),
    };
    installations = [...installations].sort(cmp[filters.order]);
    void asc;
  }

  return { kpis: base.kpis, installations };
}

async function computeOverview(tenantId: string): Promise<OverviewResult> {
  const installations = await prisma.crmInstallation.findMany({
    where: {
      tenantId,
      status: { in: ["active", "prospect"] },
    },
    select: {
      id: true,
      name: true,
      commune: true,
      account: { select: { name: true } },
      protocolSections: {
        orderBy: { order: "asc" },
        select: { id: true, icon: true },
      },
      protocolVersions: {
        where: { status: { in: ["published", "active"] } },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { versionNumber: true },
      },
      exams: {
        where: { status: "active" },
        select: {
          id: true,
          passingScore: true,
          assignments: {
            select: {
              guardId: true,
              status: true,
              score: true,
              completedAt: true,
              sentAt: true,
            },
          },
        },
      },
      opsAsignacionGuardias: {
        where: { isActive: true },
        select: { guardiaId: true },
      },
    },
  });

  let totalEvaluations = 0;
  let sumCompliance = 0;
  let countCompliance = 0;
  let critical = 0;
  let withProtocol = 0;

  const data: OverviewInstallation[] = installations.map((inst) => {
    const sectionCount = inst.protocolSections.length;
    const hasProtocol = sectionCount > 0;
    if (hasProtocol) withProtocol += 1;

    const activeGuardSet = new Set(inst.opsAsignacionGuardias.map((a) => a.guardiaId));

    const guardScoreMap = new Map<string, number[]>();
    let pendingCount = 0;
    let failedCount = 0;
    let lastExamAt: Date | null = null;
    let evaluations = 0;

    const passingScore = inst.exams[0]?.passingScore ?? 60;

    for (const exam of inst.exams) {
      for (const a of exam.assignments) {
        if (a.status === "completed") {
          evaluations += 1;
          const ts = a.completedAt ?? a.sentAt;
          if (!lastExamAt || ts > lastExamAt) lastExamAt = ts;
          if (a.score != null) {
            const arr = guardScoreMap.get(a.guardId) ?? [];
            arr.push(a.score);
            guardScoreMap.set(a.guardId, arr);
            if (a.score < passingScore) failedCount += 1;
          }
        } else if (a.status === "sent" || a.status === "opened") {
          if (activeGuardSet.has(a.guardId)) pendingCount += 1;
        }
      }
    }
    totalEvaluations += evaluations;

    const guardAvgs = Array.from(guardScoreMap.values()).map(
      (s) => s.reduce((x, y) => x + y, 0) / s.length,
    );
    const avgScore = guardAvgs.length
      ? Math.round((guardAvgs.reduce((x, y) => x + y, 0) / guardAvgs.length) * 10) / 10
      : null;

    if (avgScore !== null) {
      sumCompliance += avgScore;
      countCompliance += 1;
    }

    const status = classifyInstallationStatus({
      hasProtocol,
      evaluatedGuards: guardAvgs.length,
      avgScore,
      failedCount,
    });
    if (status === "critical") critical += 1;

    return {
      id: inst.id,
      name: inst.name,
      icon: inst.protocolSections[0]?.icon || "🏢",
      accountName: inst.account?.name ?? null,
      commune: inst.commune ?? null,
      hasProtocol,
      protocolVersion: inst.protocolVersions[0]?.versionNumber ?? null,
      sectionCount,
      activeGuards: activeGuardSet.size,
      evaluatedGuards: guardAvgs.length,
      avgScore,
      lastExamAt: lastExamAt ? (lastExamAt as Date).toISOString() : null,
      pendingCount,
      failedCount,
      status,
    };
  });

  data.sort((a, b) => {
    const order: Record<InstallationStatus, number> = {
      critical: 0,
      warning: 1,
      no_evaluated: 2,
      no_protocol: 3,
      ok: 4,
    };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.name.localeCompare(b.name);
  });

  return {
    kpis: {
      totalInstallations: installations.length,
      withProtocol,
      avgCompliance: countCompliance
        ? Math.round((sumCompliance / countCompliance) * 10) / 10
        : null,
      criticalInstallations: critical,
      totalEvaluations,
    },
    installations: data,
  };
}

/* ─────────── installation detail ─────────── */

export async function buildInstallationDetail(
  tenantId: string,
  installationId: string,
  opts: { anonymize: boolean; includeTrend?: boolean; salt?: string } = {
    anonymize: false,
  },
): Promise<InstallationDetailResult | null> {
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: {
      id: true,
      name: true,
      commune: true,
      address: true,
      account: { select: { name: true } },
      protocolSections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          icon: true,
          _count: { select: { items: true } },
        },
      },
      protocolVersions: {
        where: { status: { in: ["published", "active"] } },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { versionNumber: true },
      },
      exams: {
        where: { status: "active" },
        select: {
          id: true,
          passingScore: true,
          questions: {
            select: {
              id: true,
              correctAnswer: true,
              sectionRef: true,
              order: true,
            },
          },
          assignments: {
            select: {
              guardId: true,
              status: true,
              score: true,
              answers: true,
              completedAt: true,
              sentAt: true,
            },
          },
        },
      },
      opsAsignacionGuardias: {
        where: { isActive: true },
        select: {
          guardiaId: true,
          puesto: { select: { name: true } },
          guardia: {
            select: {
              id: true,
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  if (!inst) return null;

  const sectionIds = new Set(inst.protocolSections.map((s) => s.id));
  const sectionTitleMap = new Map(
    inst.protocolSections.map((s) => [s.id, { title: s.title, icon: s.icon }]),
  );

  // Group assignments by guardId
  const byGuard = new Map<
    string,
    {
      completedScores: number[];
      pending: number;
      lastExamAt: Date | null;
      passingScore: number;
      completedAssignments: Array<{
        answers: unknown;
        exam: {
          questions: Array<{
            id: string;
            correctAnswer: number;
            sectionRef: string | null;
            order: number;
          }>;
        };
      }>;
    }
  >();

  // Section-level aggregate
  const sectionAgg = new Map<string, { correct: number; total: number }>();

  for (const exam of inst.exams) {
    for (const a of exam.assignments) {
      const e = byGuard.get(a.guardId) ?? {
        completedScores: [],
        pending: 0,
        lastExamAt: null,
        passingScore: exam.passingScore,
        completedAssignments: [],
      };
      e.passingScore = exam.passingScore;
      if (a.status === "completed") {
        if (a.score != null) e.completedScores.push(a.score);
        const ts = a.completedAt ?? a.sentAt;
        if (!e.lastExamAt || ts > e.lastExamAt) e.lastExamAt = ts;
        e.completedAssignments.push({
          answers: a.answers,
          exam: { questions: exam.questions },
        });

        const ans = parseAnswers(a.answers);
        if (ans) {
          const orderedQ = [...exam.questions].sort((x, y) => x.order - y.order);
          orderedQ.forEach((q, idx) => {
            if (!q.sectionRef || !sectionIds.has(q.sectionRef)) return;
            const got = ans[idx];
            if (got === undefined || got === null) return;
            const s = sectionAgg.get(q.sectionRef) ?? { correct: 0, total: 0 };
            s.total += 1;
            if (Number(got) === q.correctAnswer) s.correct += 1;
            sectionAgg.set(q.sectionRef, s);
          });
        }
      } else if (a.status === "sent" || a.status === "opened") {
        e.pending += 1;
      }
      byGuard.set(a.guardId, e);
    }
  }

  const activeAsignaciones = inst.opsAsignacionGuardias;
  const activeGuardIds = new Set(activeAsignaciones.map((a) => a.guardiaId));

  let sumGuardAvgs = 0;
  let countGuardAvgs = 0;
  let approvedCount = 0;
  let failedCount = 0;
  let evaluatedGuards = 0;
  let pendingCount = 0;
  let lastExamAt: Date | null = null;

  const guardsRaw: InstallationDetailGuard[] = activeAsignaciones.map((a) => {
    const stat = byGuard.get(a.guardiaId);
    const completedScores = stat?.completedScores ?? [];
    const avgScore = completedScores.length
      ? Math.round(
          (completedScores.reduce((x, y) => x + y, 0) / completedScores.length) * 10,
        ) / 10
      : null;

    if (avgScore !== null) {
      sumGuardAvgs += avgScore;
      countGuardAvgs += 1;
      evaluatedGuards += 1;
      if (avgScore >= 80) approvedCount += 1;
      if (avgScore < (stat?.passingScore ?? 60)) failedCount += 1;
    }
    if (stat?.lastExamAt) {
      if (!lastExamAt || stat.lastExamAt > lastExamAt) lastExamAt = stat.lastExamAt;
    }
    pendingCount += stat?.pending ?? 0;

    const sectionScores = stat
      ? computeGuardSectionScores(stat.completedAssignments, sectionIds)
      : Object.fromEntries([...sectionIds].map((id) => [id, null]));

    let trend: Trend = null;
    if (completedScores.length >= 2) {
      const diff = completedScores[completedScores.length - 1] - completedScores[completedScores.length - 2];
      trend = diff > 0 ? "up" : diff < 0 ? "down" : "stable";
    }

    const fullName = formatPersonName(
      a.guardia.persona.firstName,
      a.guardia.persona.lastName,
    );

    const status = classifyGuard({
      completed: completedScores.length,
      pending: stat?.pending ?? 0,
      avgScore,
      passingScore: stat?.passingScore ?? 60,
    });

    if (opts.anonymize) {
      const { initials, opaqueId } = anonymizeGuard(
        fullName,
        a.guardiaId,
        opts.salt ?? tenantId,
      );
      return {
        guardId: opaqueId,
        name: initials,
        initials,
        shift: a.puesto?.name ?? null,
        avgScore,
        lastExamAt: stat?.lastExamAt
          ? (stat.lastExamAt as Date).toISOString()
          : null,
        pendingCount: stat?.pending ?? 0,
        trend,
        status,
        sectionScores,
      };
    }

    return {
      guardId: a.guardiaId,
      name: fullName,
      initials: initialsFromName(fullName),
      shift: a.puesto?.name ?? null,
      avgScore,
      lastExamAt: stat?.lastExamAt
        ? (stat.lastExamAt as Date).toISOString()
        : null,
      pendingCount: stat?.pending ?? 0,
      trend,
      status,
      sectionScores,
    };
  });

  // sort: failed → borderline/approved by score desc → pending → unevaluated
  const statusOrder: Record<GuardStatus, number> = {
    failed: 0,
    borderline: 1,
    approved: 2,
    pending: 3,
    unevaluated: 4,
  };
  guardsRaw.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status])
      return statusOrder[a.status] - statusOrder[b.status];
    return (b.avgScore ?? -1) - (a.avgScore ?? -1);
  });

  const sectionCompliance: InstallationDetailSectionCompliance[] = inst.protocolSections.map(
    (s) => {
      const agg = sectionAgg.get(s.id);
      const percent = agg && agg.total > 0
        ? Math.round((agg.correct / agg.total) * 100)
        : null;
      return {
        sectionId: s.id,
        title: s.title,
        icon: s.icon,
        correct: agg?.correct ?? 0,
        total: agg?.total ?? 0,
        percent,
      };
    },
  );

  const avgCompliance = countGuardAvgs
    ? Math.round((sumGuardAvgs / countGuardAvgs) * 10) / 10
    : null;

  // alert
  let alert: InstallationDetailAlert | null = null;
  if (inst.protocolSections.length === 0) {
    alert = {
      kind: "no_protocol",
      message: "Esta instalación aún no tiene protocolo. Crea uno para empezar a evaluar al equipo.",
    };
  } else if (failedCount > 0) {
    alert = {
      kind: "failed_guards",
      count: failedCount,
      message: `${failedCount} ${failedCount === 1 ? "guardia tiene" : "guardias tienen"} cumplimiento bajo el mínimo. Reagenda evaluación o capacitación.`,
    };
  } else if (avgCompliance !== null && avgCompliance < 80) {
    alert = {
      kind: "low_compliance",
      message: `Cumplimiento general en ${Math.round(avgCompliance)}%. Considera reforzar las áreas más bajas.`,
    };
  }

  let trend: InstallationDetailMonthlyAvg[] | undefined;
  if (opts.includeTrend) {
    trend = await computeMonthlyTrend(tenantId, installationId, 6);
  }

  return {
    installation: {
      id: inst.id,
      name: inst.name,
      commune: inst.commune ?? null,
      address: inst.address ?? null,
      accountName: inst.account?.name ?? null,
      icon: inst.protocolSections[0]?.icon || "🏢",
    },
    protocol: {
      hasProtocol: inst.protocolSections.length > 0,
      version: inst.protocolVersions[0]?.versionNumber ?? null,
      sections: inst.protocolSections.map((s) => ({
        id: s.id,
        title: s.title,
        icon: s.icon,
        itemCount: s._count.items,
      })),
    },
    kpis: {
      avgCompliance,
      activeGuards: activeGuardIds.size,
      evaluatedGuards,
      pendingCount,
      lastExamAt: lastExamAt ? (lastExamAt as Date).toISOString() : null,
      approvedCount,
      failedCount,
    },
    sectionCompliance,
    guards: guardsRaw,
    alert,
    evaluatedRatio: activeGuardIds.size
      ? Math.round((evaluatedGuards / activeGuardIds.size) * 100) / 100
      : 0,
    trend,
  };
  void sectionTitleMap;
}

async function computeMonthlyTrend(
  tenantId: string,
  installationId: string,
  months: number,
): Promise<InstallationDetailMonthlyAvg[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const completed = await prisma.examAssignment.findMany({
    where: {
      exam: { installationId },
      status: "completed",
      completedAt: { gte: since, not: null },
      score: { not: null },
    },
    select: { completedAt: true, score: true },
  });

  const buckets = new Map<string, number[]>();
  for (const a of completed) {
    if (!a.completedAt || a.score == null) continue;
    const key = `${a.completedAt.getFullYear()}-${String(a.completedAt.getMonth() + 1).padStart(2, "0")}`;
    const arr = buckets.get(key) ?? [];
    arr.push(a.score);
    buckets.set(key, arr);
  }

  const result: InstallationDetailMonthlyAvg[] = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const scores = buckets.get(key) ?? [];
    const avg = scores.length
      ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10
      : 0;
    result.push({ month: key, avgScore: avg });
  }
  void tenantId;
  return result;
}
