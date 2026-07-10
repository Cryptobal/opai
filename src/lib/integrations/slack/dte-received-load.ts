/**
 * Carga un FinanceDte RECIBIDO y lo mapea a `DteReceivedForBlocks` (incluye la
 * etiqueta de centro de costo "Cliente · Instalación" si ya está asignado).
 *
 * Compartido por los handlers de acuse (dte-received.ts) y de centro de costo
 * (dte-costcenter-assign.ts) para re-renderizar el bloque del DTE tras mutar.
 * SIEMPRE revalida contra `tenantId` (frontera multi-tenant). `installationId`
 * apunta a CrmInstallation (no OpsInstallation).
 */

import { prisma } from "@/lib/prisma";
import type { DteReceivedForBlocks } from "./dte-received-blocks";

/** "Cliente · Instalación" (o solo "Cliente", o null si no hay cliente). */
export async function buildCostCenterLabel(
  tenantId: string,
  crmAccountId: string | null,
  installationId: string | null,
): Promise<string | null> {
  if (!crmAccountId) return null;
  const [acc, inst] = await Promise.all([
    prisma.crmAccount.findFirst({
      where: { id: crmAccountId, tenantId },
      select: { name: true },
    }),
    installationId
      ? prisma.crmInstallation.findFirst({
          where: { id: installationId, tenantId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  if (!acc) return null;
  return inst ? `${acc.name} · ${inst.name}` : acc.name;
}

export async function loadDteForBlocks(
  tenantId: string,
  dteId: string,
): Promise<DteReceivedForBlocks | null> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "RECEIVED" },
    select: {
      id: true,
      dteType: true,
      folio: true,
      issuerName: true,
      issuerRut: true,
      date: true,
      totalAmount: true,
      netAmount: true,
      taxAmount: true,
      receptionStatus: true,
      crmAccountId: true,
      installationId: true,
    },
  });
  if (!dte) return null;

  const costCenterLabel = await buildCostCenterLabel(
    tenantId,
    dte.crmAccountId,
    dte.installationId,
  );

  return {
    dteId: dte.id,
    dteType: dte.dteType,
    folio: dte.folio,
    issuerName: dte.issuerName,
    issuerRut: dte.issuerRut,
    date: dte.date.toISOString().slice(0, 10),
    totalAmount: dte.totalAmount.toNumber(),
    netAmount: dte.netAmount.toNumber(),
    taxAmount: dte.taxAmount.toNumber(),
    receptionStatus: (dte.receptionStatus ??
      "PENDING_REVIEW") as DteReceivedForBlocks["receptionStatus"],
    costCenterLabel,
  };
}
