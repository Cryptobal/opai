import "server-only";
import { prisma } from "@/lib/prisma";
import type { FlowSection } from "@prisma/client";
import { CANONICAL_FLOW_ROWS } from "./canonical-rows";

/**
 * Auto-bootstrap de la planilla: si el tenant NO tiene ninguna fila, las crea
 * en la primera carga del matrix — nadie corre scripts:
 *  1. Una fila INGRESOS por cuenta+instalación con programación activa.
 *  2. Filas canónicas de egresos (CATEGORY si la categoría del viejo existe).
 *  3. Backfill de término de pago POR CONTRATO: copia diasCobroDesdeFactura
 *     de los items del módulo viejo (source CONTRACT/OTHER, donde Carlos ya
 *     configuró términos por contrato) a la programación equivalente —
 *     SOLO cuando el template aún no tiene término propio (null).
 *
 * Idempotente por claves naturales; solo corre completo cuando rowCount=0
 * (una carrera doble en el primerísimo load es inocua: findFirst por fila).
 */
export async function ensureFlowBootstrap(tenantId: string): Promise<void> {
  const rowCount = await prisma.financeFlowRow.count({ where: { tenantId } });
  if (rowCount > 0) return;

  const [templates, categories, oldItems] = await Promise.all([
    prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, crmAccountId: { not: null } },
      select: {
        id: true, crmAccountId: true, installationId: true,
        diasCobroDesdeFactura: true,
      },
    }),
    prisma.financeCashflowCategory.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    }),
    prisma.financeCashflowItem.findMany({
      where: {
        tenantId,
        source: { in: ["CONTRACT", "OTHER"] },
        isActive: true,
        diasCobroDesdeFactura: { gt: 0 },
        crmAccountId: { not: null },
      },
      select: { crmAccountId: true, installationId: true, diasCobroDesdeFactura: true },
    }),
  ]);

  let orderIndex = 0;
  const ensureRow = async (data: {
    section: FlowSection;
    name: string;
    mapping: "ACCOUNT_INSTALLATION" | "CATEGORY" | "MANUAL";
    crmAccountId?: string | null;
    installationId?: string | null;
    categoryId?: string | null;
  }) => {
    const where =
      data.mapping === "ACCOUNT_INSTALLATION"
        ? {
            tenantId, mapping: data.mapping,
            crmAccountId: data.crmAccountId, installationId: data.installationId ?? null,
          }
        : { tenantId, section: data.section, name: data.name };
    const existing = await prisma.financeFlowRow.findFirst({ where, select: { id: true } });
    if (existing) return;
    await prisma.financeFlowRow.create({
      data: {
        tenantId, section: data.section, name: data.name, mapping: data.mapping,
        orderIndex: orderIndex++,
        crmAccountId: data.crmAccountId ?? null,
        installationId: data.installationId ?? null,
        categoryId: data.categoryId ?? null,
      },
    });
  };

  // 1. Filas de ingreso por cuenta+instalación con programación activa.
  const seen = new Set<string>();
  for (const t of templates) {
    const key = `${t.crmAccountId}::${t.installationId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const account = await prisma.crmAccount.findFirst({
      where: { id: t.crmAccountId!, tenantId },
      select: { name: true },
    });
    if (!account) continue;
    let name = account.name;
    if (t.installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: t.installationId, tenantId },
        select: { name: true },
      });
      if (inst) name = `${account.name} · ${inst.name}`;
    }
    await ensureRow({
      section: "INGRESOS", name, mapping: "ACCOUNT_INSTALLATION",
      crmAccountId: t.crmAccountId, installationId: t.installationId,
    });
  }

  // 2. Filas canónicas.
  const catByCode = new Map(categories.map((c) => [c.code, c.id]));
  for (const c of CANONICAL_FLOW_ROWS) {
    const categoryId = c.categoryCode ? (catByCode.get(c.categoryCode) ?? null) : null;
    await ensureRow({
      section: c.section, name: c.name,
      mapping: categoryId ? "CATEGORY" : "MANUAL", categoryId,
    });
  }

  // 3. Backfill término de pago por contrato desde el módulo viejo.
  const termByKey = new Map<string, number>();
  for (const it of oldItems) {
    const exact = `${it.crmAccountId}::${it.installationId ?? ""}`;
    if (!termByKey.has(exact)) termByKey.set(exact, it.diasCobroDesdeFactura);
    const generic = `${it.crmAccountId}::`;
    if (!termByKey.has(generic)) termByKey.set(generic, it.diasCobroDesdeFactura);
  }
  for (const t of templates) {
    if (t.diasCobroDesdeFactura != null) continue; // término propio ya fijado: no pisar
    const dias =
      termByKey.get(`${t.crmAccountId}::${t.installationId ?? ""}`) ??
      termByKey.get(`${t.crmAccountId}::`);
    if (dias != null) {
      await prisma.financeDteRecurringTemplate.update({
        where: { id: t.id },
        data: { diasCobroDesdeFactura: dias },
      });
    }
  }
}
