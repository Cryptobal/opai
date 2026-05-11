import { prisma } from "@/lib/prisma";
import { calcDocStatus } from "@/lib/docs-operacionales";
import { CONTRACT_CATEGORIES } from "@/lib/validations/docs";

export type InstallationContractStatus =
  | "vigente"
  | "por_vencer"
  | "vencido"
  | "no_aplica"
  | "sin_documento";

export type InstallationContractCoverage = {
  installationId: string;
  status: InstallationContractStatus;
  contractId: string | null;
  title: string | null;
  pdfUrl: string | null;
  expiresAt: Date | null;
};

type ContractCandidate = {
  id: string;
  title: string;
  pdfUrl: string | null;
  expirationDate: Date | null;
  alertDaysBefore: number;
  associations: Array<{ entityId: string }>;
};

const COUNTABLE_CONTRACT_STATUSES = ["approved", "active", "expiring", "expired", "renewed"];

function rankStatus(status: InstallationContractStatus) {
  switch (status) {
    case "vigente":
    case "no_aplica":
      return 0;
    case "por_vencer":
      return 1;
    case "vencido":
      return 2;
    case "sin_documento":
    default:
      return 3;
  }
}

function buildCoverage(
  installationId: string,
  contract: ContractCandidate,
  alertDays: number,
): InstallationContractCoverage {
  const status = calcDocStatus(
    contract.expirationDate,
    true,
    alertDays,
  ) as Exclude<InstallationContractStatus, "sin_documento">;

  return {
    installationId,
    status,
    contractId: contract.id,
    title: contract.title,
    pdfUrl: contract.pdfUrl,
    expiresAt: contract.expirationDate,
  };
}

function pickBestContract(
  current: InstallationContractCoverage | undefined,
  next: InstallationContractCoverage,
) {
  if (!current) return next;

  const currentRank = rankStatus(current.status);
  const nextRank = rankStatus(next.status);
  if (nextRank !== currentRank) return nextRank < currentRank ? next : current;

  const currentExpiry = current.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const nextExpiry = next.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return nextExpiry < currentExpiry ? next : current;
}

export async function getInstallationContractCoverage(params: {
  tenantId: string;
  installationIds: string[];
  alertDaysBefore?: number;
}): Promise<Map<string, InstallationContractCoverage>> {
  const uniqueInstallationIds = Array.from(new Set(params.installationIds));
  const coverage = new Map<string, InstallationContractCoverage>();

  for (const installationId of uniqueInstallationIds) {
    coverage.set(installationId, {
      installationId,
      status: "sin_documento",
      contractId: null,
      title: null,
      pdfUrl: null,
      expiresAt: null,
    });
  }

  if (uniqueInstallationIds.length === 0) return coverage;

  const contracts = await prisma.document.findMany({
    where: {
      tenantId: params.tenantId,
      module: "crm",
      category: { in: [...CONTRACT_CATEGORIES] },
      status: { in: COUNTABLE_CONTRACT_STATUSES },
      associations: {
        some: {
          entityType: "crm_installation",
          entityId: { in: uniqueInstallationIds },
        },
      },
    },
    select: {
      id: true,
      title: true,
      pdfUrl: true,
      expirationDate: true,
      alertDaysBefore: true,
      associations: {
        where: {
          entityType: "crm_installation",
          entityId: { in: uniqueInstallationIds },
        },
        select: { entityId: true },
      },
    },
  });

  for (const contract of contracts) {
    for (const association of contract.associations) {
      const next = buildCoverage(
        association.entityId,
        contract,
        params.alertDaysBefore ?? contract.alertDaysBefore,
      );
      coverage.set(association.entityId, pickBestContract(coverage.get(association.entityId), next));
    }
  }

  return coverage;
}
