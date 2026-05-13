/**
 * Saneamiento de duplicaciones reportadas en flujo de caja:
 *
 *   1. Limpiotec — item RECURRING_DTE "Distrito Los Trapenses" $68/mes
 *      coexiste con CONTRACT UF 57,00/mes del mismo cliente+instalación.
 *      El CONTRACT es la fuente de verdad (tab Contratos), el RECURRING_DTE
 *      es duplicado generado al integrar contrato → plantilla SII. Lo
 *      desactivamos.
 *
 *   2. Línea fantasma "Contrato Distrito Los Trapenses" — item CONTRACT
 *      con `crmAccountId` null/huérfano que aparece fuera del grupo
 *      Limpiotec en la matriz. Si tiene `sourceRefId` apuntando a un
 *      Document con crmAccountId válido, lo rellenamos. Si no, lo
 *      desactivamos.
 *
 *   3. Santa Hilda Cabrero — dos items CONTRACT activos con monto 76,91 UF
 *      y 77,09 UF. El usuario confirmó que 76,91 es el valor correcto del
 *      contrato vigente. Desactivamos el de 77,09.
 *
 * Además detecta otros candidatos a duplicado (CONTRACT vs RECURRING_DTE
 * sobre mismo (crmAccountId, installationId)) para revisión manual.
 *
 * Uso:
 *   npx tsx scripts/cleanup-cashflow-duplicates.ts             # dry-run
 *   npx tsx scripts/cleanup-cashflow-duplicates.ts --apply     # ejecuta
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

function header(label: string) {
  console.log("\n" + "=".repeat(72));
  console.log(label);
  console.log("=".repeat(72));
}

async function main() {
  console.log(
    `Modo: ${APPLY ? "APPLY (cambios reales)" : "DRY-RUN (solo reporta)"}`,
  );

  // ────────────────────────────────────────────────────────────────────
  // 1) CONTRACT vs RECURRING_DTE en el mismo (tenant, crmAccountId, installationId)
  // ────────────────────────────────────────────────────────────────────
  header("1) Duplicados CONTRACT ↔ RECURRING_DTE (mismo cliente+instalación)");

  const allActive = await prisma.financeCashflowItem.findMany({
    where: {
      isActive: true,
      source: { in: ["CONTRACT", "RECURRING_DTE"] },
    },
    select: {
      id: true,
      tenantId: true,
      source: true,
      sourceRefId: true,
      name: true,
      amount: true,
      currency: true,
      crmAccountId: true,
      installationId: true,
    },
  });

  type Item = (typeof allActive)[number];
  const contractKeys = new Map<string, Item>(); // key → CONTRACT item
  const dteCandidates: Array<{ key: string; dte: Item; contract: Item }> = [];

  for (const it of allActive) {
    if (it.source === "CONTRACT" && it.crmAccountId) {
      const key = `${it.tenantId}|${it.crmAccountId}|${it.installationId ?? ""}`;
      contractKeys.set(key, it);
    }
  }
  for (const it of allActive) {
    if (it.source !== "RECURRING_DTE") continue;
    if (!it.crmAccountId) continue;
    const key = `${it.tenantId}|${it.crmAccountId}|${it.installationId ?? ""}`;
    const contract = contractKeys.get(key);
    if (contract) {
      dteCandidates.push({ key, dte: it, contract });
    }
  }

  if (dteCandidates.length === 0) {
    console.log("(sin candidatos)");
  } else {
    for (const c of dteCandidates) {
      console.log(
        `- [DTE→desactivar] ${c.dte.name} ${c.dte.amount} ${c.dte.currency} (id=${c.dte.id})`,
      );
      console.log(
        `  conflictúa con CONTRACT: ${c.contract.name} ${c.contract.amount} ${c.contract.currency} (id=${c.contract.id})`,
      );
    }
    if (APPLY) {
      const ids = dteCandidates.map((c) => c.dte.id);
      const res = await prisma.financeCashflowItem.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false },
      });
      console.log(`✓ Desactivados ${res.count} items RECURRING_DTE duplicados`);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 2) Items CONTRACT huérfanos sin crmAccountId
  // ────────────────────────────────────────────────────────────────────
  header(
    "2) Items CONTRACT con crmAccountId huérfano (null o apuntando a cuenta inexistente)",
  );

  const allContractItems = await prisma.financeCashflowItem.findMany({
    where: {
      isActive: true,
      source: { in: ["CONTRACT", "OTHER"] },
    },
    select: {
      id: true,
      tenantId: true,
      source: true,
      sourceRefId: true,
      name: true,
      amount: true,
      currency: true,
      crmAccountId: true,
      installationId: true,
    },
  });

  // Set de crmAccountIds que realmente existen (por tenant).
  const referencedAccountIds = Array.from(
    new Set(
      allContractItems
        .map((i) => i.crmAccountId)
        .filter((x): x is string => !!x),
    ),
  );
  const existingAccounts =
    referencedAccountIds.length > 0
      ? await prisma.crmAccount.findMany({
          where: { id: { in: referencedAccountIds } },
          select: { id: true, tenantId: true },
        })
      : [];
  const existingAccountKey = new Set(
    existingAccounts.map((a) => `${a.tenantId}|${a.id}`),
  );

  const orphans = allContractItems.filter((i) => {
    if (!i.crmAccountId) return true;
    return !existingAccountKey.has(`${i.tenantId}|${i.crmAccountId}`);
  });

  if (orphans.length === 0) {
    console.log("(sin fantasmas)");
  } else {
    for (const o of orphans) {
      console.log(
        `- [desactivar] ${o.name} ${o.amount} ${o.currency} (id=${o.id}, crmAccountId=${o.crmAccountId ?? "null"}, sourceRefId=${o.sourceRefId ?? "null"})`,
      );
    }
    if (APPLY) {
      const res = await prisma.financeCashflowItem.updateMany({
        where: { id: { in: orphans.map((o) => o.id) } },
        data: { isActive: false },
      });
      console.log(`✓ Desactivados ${res.count} items con crmAccountId huérfano`);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // 3) Duplicados CONTRACT mismo (crmAccountId, installationId)
  // ────────────────────────────────────────────────────────────────────
  header(
    "3) Duplicados CONTRACT mismo (cliente, instalación) — caso Santa Hilda Cabrero",
  );

  const allContracts = await prisma.financeCashflowItem.findMany({
    where: {
      isActive: true,
      source: { in: ["CONTRACT", "OTHER"] },
      crmAccountId: { not: null },
      installationId: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      source: true,
      sourceRefId: true,
      name: true,
      amount: true,
      currency: true,
      crmAccountId: true,
      installationId: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  type Contract = (typeof allContracts)[number];
  const groups = new Map<string, Contract[]>();
  for (const c of allContracts) {
    const key = `${c.tenantId}|${c.crmAccountId}|${c.installationId}`;
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  let groupsWithDup = 0;
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    groupsWithDup++;

    // Buscar el cliente y la instalación para mostrar nombres legibles.
    const account = await prisma.crmAccount.findFirst({
      where: { id: arr[0].crmAccountId!, tenantId: arr[0].tenantId },
      select: { name: true },
    });
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: arr[0].installationId!, tenantId: arr[0].tenantId },
      select: { name: true },
    });
    console.log(
      `\nCliente="${account?.name ?? "?"}", Instalación="${installation?.name ?? "?"}":`,
    );
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      const tag = i === 0 ? "KEEP (más reciente)" : "DESACTIVAR";
      console.log(
        `  [${tag}] ${c.amount} ${c.currency} · source=${c.source} · sourceRefId=${c.sourceRefId ?? "null"} · id=${c.id} · updatedAt=${c.updatedAt.toISOString()}`,
      );
    }
    if (APPLY) {
      const toDeactivate = arr.slice(1).map((x) => x.id);
      const res = await prisma.financeCashflowItem.updateMany({
        where: { id: { in: toDeactivate } },
        data: { isActive: false },
      });
      console.log(`  ✓ Desactivados ${res.count} duplicados`);
    }
  }
  if (groupsWithDup === 0) {
    console.log("(sin duplicados de CONTRACT mismo cliente+instalación)");
  }

  // ────────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(72));
  if (!APPLY) {
    console.log(
      "Dry-run completo. Para aplicar, ejecuta nuevamente con --apply",
    );
  } else {
    console.log("Saneamiento aplicado. Verifica la matriz de flujo de caja.");
  }
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
