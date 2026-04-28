/**
 * Builds the data set needed by the "Reporte cliente" PDF.
 *
 * The shape mirrors what `ClientViewSubTab.tsx` renders on screen, so the
 * PDF stays aligned with the on-page preview.
 */

import { prisma } from "@/lib/prisma";
import { buildInstallationDetail } from "@/lib/protocols/knowledge-aggregator";

export interface ClientReportData {
  generatedAt: string;
  installation: {
    id: string;
    name: string;
    accountName: string | null;
    commune: string | null;
  };
  tenant: {
    id: string;
    companyName: string | null;
    logoUrl: string | null;
  };
  kpis: {
    activeGuards: number;
    avgCompliance: number | null;
    approvedCount: number;
    lastExamAt: string | null;
  };
  sectionCompliance: Array<{
    title: string;
    icon: string;
    percent: number | null;
  }>;
  guards: Array<{
    name: string;
    shift: string | null;
    lastExamAt: string | null;
    avgScore: number | null;
    status: "approved" | "borderline" | "failed" | "pending" | "unevaluated";
  }>;
}

export async function buildClientReportData(
  tenantId: string,
  installationId: string,
): Promise<ClientReportData | null> {
  const detail = await buildInstallationDetail(tenantId, installationId, {
    anonymize: false,
  });
  if (!detail) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });

  return {
    generatedAt: new Date().toISOString(),
    installation: {
      id: detail.installation.id,
      name: detail.installation.name,
      accountName: detail.installation.accountName,
      commune: detail.installation.commune,
    },
    tenant: {
      id: tenantId,
      companyName: tenant?.name ?? null,
      logoUrl: null,
    },
    kpis: {
      activeGuards: detail.kpis.activeGuards,
      avgCompliance: detail.kpis.avgCompliance,
      approvedCount: detail.kpis.approvedCount,
      lastExamAt: detail.kpis.lastExamAt,
    },
    sectionCompliance: detail.sectionCompliance.map((s) => ({
      title: s.title,
      icon: s.icon,
      percent: s.percent,
    })),
    guards: detail.guards.map((g) => ({
      name: g.name,
      shift: g.shift,
      lastExamAt: g.lastExamAt,
      avgScore: g.avgScore,
      status: g.status,
    })),
  };
}
