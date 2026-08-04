import { NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Listado de items source=CONTRACT del tenant para la vista de
 * configuración masiva en `/finanzas/configuracion/contratos`.
 *
 * Solo accesible con capability `cashflow_configure`.
 *
 * Expone monto, moneda, vigencia e IPC. El calendario de emisión/cobro
 * vive en FinanceDteRecurringTemplate (vista programaciones-cobro).
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }

  const items = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      source: "CONTRACT",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      nickname: true,
      crmAccountId: true,
      installationId: true,
      amount: true,
      currency: true,
      dayOfMonth: true,
      startDate: true,
      endDate: true,
      hasIpcAdjustment: true,
      ipcAdjustmentMonths: true,
      ipcStartDate: true,
    },
    orderBy: { name: "asc" },
  });

  const accountIds = Array.from(
    new Set(items.map((i) => i.crmAccountId).filter(Boolean)),
  ) as string[];
  const installationIds = Array.from(
    new Set(items.map((i) => i.installationId).filter(Boolean)),
  ) as string[];

  const [accounts, installations] = await Promise.all([
    accountIds.length > 0
      ? prisma.crmAccount.findMany({
          where: { id: { in: accountIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    installationIds.length > 0
      ? prisma.crmInstallation.findMany({
          where: { id: { in: installationIds }, tenantId: ctx.tenantId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const accountById = new Map(accounts.map((a) => [a.id, a.name]));
  const installationById = new Map(installations.map((i) => [i.id, i.name]));

  const enriched = items.map((it) => ({
    ...it,
    amount: Number(it.amount),
    startDate: it.startDate.toISOString().slice(0, 10),
    endDate: it.endDate ? it.endDate.toISOString().slice(0, 10) : null,
    ipcStartDate: it.ipcStartDate
      ? it.ipcStartDate.toISOString().slice(0, 10)
      : null,
    accountName: it.crmAccountId
      ? accountById.get(it.crmAccountId) ?? null
      : null,
    installationName: it.installationId
      ? installationById.get(it.installationId) ?? null
      : null,
  }));

  return NextResponse.json({ success: true, data: enriched });
}
