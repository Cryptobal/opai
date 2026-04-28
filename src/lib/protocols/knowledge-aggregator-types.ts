/**
 * Client-safe types for the knowledge aggregator.
 * Kept in its own module (no Prisma imports) so it can be consumed
 * from `'use client'` components without pulling in server code.
 */

export type InstallationStatus =
  | "ok"
  | "warning"
  | "critical"
  | "no_protocol"
  | "no_evaluated";

export type GuardStatus =
  | "approved"
  | "borderline"
  | "failed"
  | "pending"
  | "unevaluated";

export type Trend = "up" | "down" | "stable" | null;

export type GuardSectionScores = Record<string, number | null>;

export interface OverviewKpis {
  totalInstallations: number;
  withProtocol: number;
  avgCompliance: number | null;
  criticalInstallations: number;
  totalEvaluations: number;
}

export interface OverviewInstallation {
  id: string;
  name: string;
  icon: string;
  accountName: string | null;
  commune: string | null;
  hasProtocol: boolean;
  protocolVersion: number | null;
  sectionCount: number;
  activeGuards: number;
  evaluatedGuards: number;
  avgScore: number | null;
  lastExamAt: string | null;
  pendingCount: number;
  failedCount: number;
  status: InstallationStatus;
}

export interface OverviewResult {
  kpis: OverviewKpis;
  installations: OverviewInstallation[];
}

export interface OverviewFilters {
  search?: string;
  status?: InstallationStatus | "all";
  order?: "score_asc" | "score_desc" | "name" | "lastExam";
}

export interface InstallationDetailGuard {
  guardId: string;
  name: string;
  initials: string;
  shift: string | null;
  avgScore: number | null;
  lastExamAt: string | null;
  pendingCount: number;
  trend: Trend;
  status: GuardStatus;
  sectionScores: GuardSectionScores;
}

export interface InstallationDetailSectionCompliance {
  sectionId: string;
  title: string;
  icon: string;
  correct: number;
  total: number;
  percent: number | null;
}

export interface InstallationDetailAlert {
  kind: "no_protocol" | "failed_guards" | "low_compliance" | "none";
  count?: number;
  message?: string;
}

export interface InstallationDetailMonthlyAvg {
  month: string;
  avgScore: number;
}

export interface InstallationDetailResult {
  installation: {
    id: string;
    name: string;
    commune: string | null;
    address: string | null;
    accountName: string | null;
    icon: string;
  };
  protocol: {
    hasProtocol: boolean;
    version: number | null;
    sections: Array<{ id: string; title: string; icon: string; itemCount: number }>;
  };
  kpis: {
    avgCompliance: number | null;
    activeGuards: number;
    evaluatedGuards: number;
    pendingCount: number;
    lastExamAt: string | null;
    approvedCount: number;
    failedCount: number;
  };
  sectionCompliance: InstallationDetailSectionCompliance[];
  guards: InstallationDetailGuard[];
  alert: InstallationDetailAlert | null;
  evaluatedRatio: number;
  trend?: InstallationDetailMonthlyAvg[];
}
