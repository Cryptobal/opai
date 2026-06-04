import { PrismaClient } from "@prisma/client";

/**
 * Fase 2 — Migra la configuración de reajuste IPC desde FinanceCashflowItem
 * (lado contrato/flujo de caja) hacia FinanceDteRecurringTemplate (Programación),
 * en modo "manual con alerta".
 *
 * NO toca montos ni borra nada del lado viejo. Solo copia
 * (hasIpcAdjustment, ipcAdjustmentMonths, ipcStartDate) a la plantilla
 * correspondiente. El desmantelamiento de la feature vieja es una fase posterior.
 *
 * Matching ítem → plantilla:
 *   - source=RECURRING_DTE → item.sourceRefId === template.id (directo).
 *   - source=CONTRACT      → item.sourceRefId === Document.id (contractDocumentId)
 *                            desambiguando por installationId cuando hay varias.
 *
 * Uso:
 *   npx tsx scripts/migrate-ipc-to-recurring-template.ts            # DRY RUN (no escribe)
 *   npx tsx scripts/migrate-ipc-to-recurring-template.ts --apply    # aplica
 *   npx tsx scripts/migrate-ipc-to-recurring-template.ts --tenant=<id>  # acota a un tenant
 */

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const TENANT_ARG = process.argv
  .find((a) => a.startsWith("--tenant="))
  ?.split("=")[1];

type Plan = {
  itemId: string;
  itemName: string;
  itemSource: string;
  tenantId: string;
  templateId: string;
  templateName: string;
  months: number | null;
  ipcStartDate: Date | null;
  alreadyConfigured: boolean;
};

type Unmatched = {
  itemId: string;
  itemName: string;
  itemSource: string;
  tenantId: string;
  reason: string;
};

async function main() {
  const where: { hasIpcAdjustment: true; isActive: true; tenantId?: string } = {
    hasIpcAdjustment: true,
    isActive: true,
  };
  if (TENANT_ARG) where.tenantId = TENANT_ARG;

  const items = await prisma.financeCashflowItem.findMany({
    where,
    select: {
      id: true,
      tenantId: true,
      name: true,
      source: true,
      sourceRefId: true,
      installationId: true,
      ipcAdjustmentMonths: true,
      ipcStartDate: true,
    },
  });

  console.log(
    `\n[migrate-ipc] ${items.length} ítem(es) con IPC activo${
      TENANT_ARG ? ` (tenant ${TENANT_ARG})` : ""
    }. Modo: ${APPLY ? "APPLY" : "DRY RUN"}\n`,
  );

  const plans: Plan[] = [];
  const unmatched: Unmatched[] = [];

  for (const item of items) {
    if (!item.sourceRefId) {
      unmatched.push({
        itemId: item.id,
        itemName: item.name,
        itemSource: item.source,
        tenantId: item.tenantId,
        reason: "sin sourceRefId — no se puede mapear a plantilla",
      });
      continue;
    }

    let template: { id: string; name: string } | null = null;

    if (item.source === "RECURRING_DTE") {
      // Vínculo directo: el ítem es el espejo de la plantilla.
      template = await prisma.financeDteRecurringTemplate.findFirst({
        where: { id: item.sourceRefId, tenantId: item.tenantId },
        select: { id: true, name: true },
      });
      if (!template) {
        unmatched.push({
          itemId: item.id,
          itemName: item.name,
          itemSource: item.source,
          tenantId: item.tenantId,
          reason: `plantilla ${item.sourceRefId} no existe`,
        });
        continue;
      }
    } else {
      // CONTRACT (u OTHER): sourceRefId === Document.id. Buscar plantillas del
      // contrato y desambiguar por installationId.
      const candidates = await prisma.financeDteRecurringTemplate.findMany({
        where: {
          tenantId: item.tenantId,
          contractDocumentId: item.sourceRefId,
        },
        select: { id: true, name: true, installationId: true },
      });

      if (candidates.length === 0) {
        unmatched.push({
          itemId: item.id,
          itemName: item.name,
          itemSource: item.source,
          tenantId: item.tenantId,
          reason:
            "contrato sin FinanceDteRecurringTemplate (programación) — crear la programación y configurar IPC ahí manualmente",
        });
        continue;
      }

      let match = candidates;
      if (item.installationId) {
        const byInst = candidates.filter(
          (c) => c.installationId === item.installationId,
        );
        if (byInst.length > 0) match = byInst;
      } else {
        const global = candidates.filter((c) => c.installationId === null);
        if (global.length > 0) match = global;
      }

      if (match.length !== 1) {
        unmatched.push({
          itemId: item.id,
          itemName: item.name,
          itemSource: item.source,
          tenantId: item.tenantId,
          reason: `${match.length} plantillas candidatas (instalación=${
            item.installationId ?? "global"
          }) — ambiguo, migrar a mano: ${match.map((m) => m.id).join(", ")}`,
        });
        continue;
      }
      template = { id: match[0].id, name: match[0].name };
    }

    const existing = await prisma.financeDteRecurringTemplate.findUnique({
      where: { id: template.id },
      select: { hasIpcAdjustment: true },
    });

    plans.push({
      itemId: item.id,
      itemName: item.name,
      itemSource: item.source,
      tenantId: item.tenantId,
      templateId: template.id,
      templateName: template.name,
      months: item.ipcAdjustmentMonths,
      ipcStartDate: item.ipcStartDate,
      alreadyConfigured: existing?.hasIpcAdjustment ?? false,
    });
  }

  // ── Reporte ──
  console.log(`✅ A migrar: ${plans.length}`);
  for (const p of plans) {
    const flag = p.alreadyConfigured ? " ⚠️ (plantilla ya tenía IPC — se sobreescribe)" : "";
    console.log(
      `   · [${p.itemSource}] "${p.itemName}" → plantilla "${p.templateName}" (${p.templateId})  meses=${p.months ?? "—"} start=${
        p.ipcStartDate?.toISOString().slice(0, 10) ?? "—"
      }${flag}`,
    );
  }

  console.log(`\n⛔ Sin migrar automáticamente: ${unmatched.length}`);
  for (const u of unmatched) {
    console.log(`   · [${u.itemSource}] "${u.itemName}" (${u.itemId}) — ${u.reason}`);
  }

  if (!APPLY) {
    console.log(`\n[migrate-ipc] DRY RUN — no se escribió nada. Re-ejecutá con --apply para aplicar.\n`);
    return;
  }

  let written = 0;
  for (const p of plans) {
    await prisma.financeDteRecurringTemplate.update({
      where: { id: p.templateId },
      data: {
        hasIpcAdjustment: true,
        ipcAdjustmentMonths: p.months,
        ipcStartDate: p.ipcStartDate,
      },
    });
    written++;
  }
  console.log(`\n[migrate-ipc] APPLY listo — ${written} plantilla(s) actualizada(s).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
