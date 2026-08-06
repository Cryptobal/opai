/**
 * Configuración de renglones del flujo (vista de configuración).
 * Lista filas activas con cuentas contables asociadas (sin categorías).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { FlowRowKey, FlowSection } from "@prisma/client";
import type { RowAccountRef } from "@/modules/finance/flow-v3/rowAccount.service";
import { getFlowHealth } from "./flow-health.service";
import type { FlowHealthReport } from "./flow-health.types";

export interface FlowRowConfigAccount {
  accountPlanId: string;
  code: string;
  name: string;
  isPrimary: boolean;
  isDefaultTarget: boolean;
}

export interface FlowRowConfigItem {
  id: string;
  name: string;
  section: string;
  mapping: string;
  orderIndex: number;
  archivedAt: string | null;
  canonicalKey: string | null;
  crmAccountId: string | null;
  accounts: FlowRowConfigAccount[];
}

export interface FlowRowsConfigPayload {
  rows: FlowRowConfigItem[];
  health: FlowHealthReport;
}

function mapAccounts(refs: RowAccountRef[]): FlowRowConfigAccount[] {
  return refs.map((m) => ({
    accountPlanId: m.accountPlanId,
    code: m.accountPlan.code,
    name: m.accountPlan.name,
    isPrimary: m.isPrimary,
    isDefaultTarget: m.isDefaultTarget,
  }));
}

export async function getFlowRowsConfig(
  tenantId: string,
): Promise<FlowRowsConfigPayload> {
  const [rows, health, mappings] = await Promise.all([
    prisma.financeFlowRow.findMany({
      where: { tenantId, archivedAt: null },
      orderBy: [{ section: "asc" }, { orderIndex: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        section: true,
        mapping: true,
        orderIndex: true,
        archivedAt: true,
        canonicalKey: true,
        crmAccountId: true,
      },
    }),
    getFlowHealth(tenantId),
    prisma.financeFlowRowAccount.findMany({
      where: { tenantId },
      include: {
        accountPlan: { select: { code: true, name: true, type: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  const accountsByRow = new Map<string, FlowRowConfigAccount[]>();
  for (const m of mappings) {
    const list = accountsByRow.get(m.rowId) ?? [];
    list.push({
      accountPlanId: m.accountPlanId,
      code: m.accountPlan.code,
      name: m.accountPlan.name,
      isPrimary: m.isPrimary,
      isDefaultTarget: m.isDefaultTarget,
    });
    accountsByRow.set(m.rowId, list);
  }

  const items: FlowRowConfigItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    section: r.section,
    mapping: r.mapping,
    orderIndex: r.orderIndex,
    archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
    canonicalKey: r.canonicalKey,
    crmAccountId: r.crmAccountId,
    accounts: accountsByRow.get(r.id) ?? [],
  }));

  return { rows: items, health };
}

export interface PatchFlowRowConfigInput {
  name?: string;
  section?: string;
  accountPlanIds?: string[];
  defaultTargetAccountPlanId?: string | null;
  canonicalKey?: string | null;
}

export async function patchFlowRowConfig(
  tenantId: string,
  rowId: string,
  patch: PatchFlowRowConfigInput,
) {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId, archivedAt: null },
    select: { id: true, mapping: true },
  });
  if (!row) throw new Error("Renglón no encontrado");

  const { updateRow } = await import("@/modules/finance/flow-v3/rows.service");

  const hasChange =
    patch.name !== undefined ||
    patch.section !== undefined ||
    patch.accountPlanIds !== undefined ||
    patch.canonicalKey !== undefined;
  if (!hasChange) {
    throw new Error("Nada que actualizar");
  }

  // Un solo pase por updateRow (guardas de sección + 409 de llave).
  await updateRow(tenantId, rowId, {
    name: patch.name,
    section: patch.section as FlowSection | undefined,
    accountPlanIds: patch.accountPlanIds,
    canonicalKey: patch.canonicalKey as FlowRowKey | null | undefined,
  });

  if (
    patch.accountPlanIds !== undefined &&
    patch.defaultTargetAccountPlanId &&
    patch.accountPlanIds.includes(patch.defaultTargetAccountPlanId)
  ) {
    const { setDefaultTarget } = await import(
      "@/modules/finance/flow-v3/rowAccount.service"
    );
    await setDefaultTarget(
      tenantId,
      rowId,
      patch.defaultTargetAccountPlanId,
    );
  }

  const { listAccountsForRow } = await import(
    "@/modules/finance/flow-v3/rowAccount.service"
  );
  const updated = await prisma.financeFlowRow.findFirstOrThrow({
    where: { id: rowId, tenantId },
    select: {
      id: true,
      name: true,
      section: true,
      mapping: true,
      orderIndex: true,
      archivedAt: true,
      canonicalKey: true,
      crmAccountId: true,
    },
  });
  const accounts = mapAccounts(await listAccountsForRow(tenantId, rowId));
  return {
    ...updated,
    archivedAt: updated.archivedAt?.toISOString() ?? null,
    accounts,
  };
}
