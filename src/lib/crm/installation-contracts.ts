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
  /**
   * Mapa opcional installationId → accountId. Cuando se provee, además de
   * buscar contratos asociados directamente a cada instalación, también se
   * consideran cubiertas las instalaciones cuya cuenta tiene un contrato
   * "global" asociado (entityType=crm_account). Es el caso de un cliente
   * con un contrato marco que cubre N instalaciones, sin necesidad de
   * crear DocAssociation por cada una.
   */
  installationAccountMap?: Map<string, string>;
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

  // Lookup 1: contratos asociados DIRECTAMENTE a las instalaciones.
  const directContracts = await prisma.document.findMany({
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

  for (const contract of directContracts) {
    for (const association of contract.associations) {
      const next = buildCoverage(
        association.entityId,
        contract,
        params.alertDaysBefore ?? contract.alertDaysBefore,
      );
      coverage.set(
        association.entityId,
        pickBestContract(coverage.get(association.entityId), next),
      );
    }
  }

  // Lookup 2: contratos "globales" asociados a la CUENTA. Cubren todas las
  // instalaciones de esa cuenta como fallback cuando no hay un contrato
  // específico de instalación. Esto cubre dos casos reales:
  //   (a) contratos legacy subidos sin link a instalaciones (solo cuenta).
  //   (b) contratos marco intencionalmente a nivel cuenta (ej. Polpaico
  //       con un contrato que cubre 4 instalaciones).
  if (params.installationAccountMap && params.installationAccountMap.size > 0) {
    const accountIds = Array.from(
      new Set(Array.from(params.installationAccountMap.values())),
    );
    if (accountIds.length > 0) {
      const accountContracts = await prisma.document.findMany({
        where: {
          tenantId: params.tenantId,
          module: "crm",
          category: { in: [...CONTRACT_CATEGORIES] },
          status: { in: COUNTABLE_CONTRACT_STATUSES },
          associations: {
            some: {
              entityType: "crm_account",
              entityId: { in: accountIds },
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
              entityType: "crm_account",
              entityId: { in: accountIds },
            },
            select: { entityId: true },
          },
        },
      });

      // Indexamos contratos por accountId para asignarlos a sus instalaciones.
      const contractsByAccount = new Map<string, typeof accountContracts>();
      for (const contract of accountContracts) {
        for (const assoc of contract.associations) {
          const list = contractsByAccount.get(assoc.entityId) ?? [];
          list.push(contract);
          contractsByAccount.set(assoc.entityId, list);
        }
      }

      for (const [installationId, accountId] of params.installationAccountMap) {
        const accountContractsForInst = contractsByAccount.get(accountId);
        if (!accountContractsForInst) continue;
        for (const contract of accountContractsForInst) {
          const next = buildCoverage(
            installationId,
            { ...contract, associations: [] },
            params.alertDaysBefore ?? contract.alertDaysBefore,
          );
          coverage.set(
            installationId,
            pickBestContract(coverage.get(installationId), next),
          );
        }
      }
    }
  }

  return coverage;
}
