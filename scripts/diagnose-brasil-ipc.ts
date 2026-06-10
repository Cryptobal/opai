import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) Encontrar el/los CrmAccount de Brasil
  const accounts = await prisma.crmAccount.findMany({
    where: {
      OR: [
        { name: { contains: "brasil", mode: "insensitive" } },
        { legalName: { contains: "brasil", mode: "insensitive" } },
      ],
    },
    select: { id: true, tenantId: true, name: true, legalName: true, rut: true },
  });

  console.log("════════════════════════════════════════");
  console.log("ACCOUNTS DE BRASIL ENCONTRADOS");
  console.log("════════════════════════════════════════");
  console.log(JSON.stringify(accounts, null, 2));
  if (accounts.length === 0) {
    console.log("⚠️  Sin accounts de Brasil — abortar.");
    return;
  }

  const accountIds = accounts.map((a) => a.id);

  // 2) Item(s) de contrato del cliente Brasil.
  const items = await prisma.financeCashflowItem.findMany({
    where: {
      crmAccountId: { in: accountIds },
      source: "CONTRACT",
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      amount: true,
      currency: true,
      startDate: true,
      hasIpcAdjustment: true,
      ipcAdjustmentMonths: true,
      dayOfMonth: true,
      recurrence: true,
      isActive: true,
      installationId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n════════════════════════════════════════");
  console.log("ITEMS DE CONTRATO DE BRASIL");
  console.log("════════════════════════════════════════");
  for (const it of items) {
    console.log({
      id: it.id,
      name: it.name,
      amount: it.amount.toString(),
      currency: it.currency,
      startDate: it.startDate.toISOString().slice(0, 10),
      hasIpcAdjustment: it.hasIpcAdjustment,
      ipcAdjustmentMonths: it.ipcAdjustmentMonths,
      dayOfMonth: it.dayOfMonth,
      recurrence: it.recurrence,
      isActive: it.isActive,
      installationId: it.installationId,
    });
  }
  if (items.length === 0) {
    console.log("⚠️  Sin items de contrato — abortar.");
    return;
  }

  const itemIds = items.map((i) => i.id);

  // 3) Ajustes IPC registrados para esos items.
  const adjustments = await prisma.financeContractIpcAdjustment.findMany({
    where: { itemId: { in: itemIds } },
    select: {
      id: true,
      itemId: true,
      dueDate: true,
      status: true,
      oldAmount: true,
      newAmount: true,
      appliedPct: true,
      appliedAt: true,
      appliedBy: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { dueDate: "asc" },
  });

  console.log("\n════════════════════════════════════════");
  console.log("AJUSTES IPC DEL ITEM (TODOS LOS STATUS)");
  console.log("════════════════════════════════════════");
  if (adjustments.length === 0) {
    console.log("⚠️  CERO ajustes IPC registrados para los items de Brasil.");
    console.log("    → Esto significa Causa C: el reajuste nunca se registró");
    console.log("      como FinanceContractIpcAdjustment.");
  } else {
    for (const adj of adjustments) {
      console.log({
        id: adj.id,
        itemId: adj.itemId,
        dueDate: adj.dueDate.toISOString().slice(0, 10),
        status: adj.status,
        oldAmount: adj.oldAmount?.toString() ?? null,
        newAmount: adj.newAmount?.toString() ?? null,
        appliedPct: adj.appliedPct?.toString() ?? null,
        appliedAt: adj.appliedAt?.toISOString() ?? null,
        appliedBy: adj.appliedBy,
        notes: adj.notes,
      });
    }
  }

  // 4) Factura 1694 con sus líneas (de dónde sacó el monto real $24.024.231).
  const dte1694 = await prisma.financeDte.findFirst({
    where: {
      folio: 1694,
      dteType: 33,
      crmAccountId: { in: accountIds },
    },
    select: {
      id: true,
      folio: true,
      date: true,
      siiStatus: true,
      paymentStatus: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      createdAt: true,
      lines: {
        select: {
          description: true,
          quantity: true,
          unitPrice: true,
          isExempt: true,
          netAmount: true,
        },
      },
    },
  });

  console.log("\n════════════════════════════════════════");
  console.log("FACTURA 1694 — HEADER Y LÍNEAS");
  console.log("════════════════════════════════════════");
  if (!dte1694) {
    console.log("⚠️  Factura 1694 no encontrada para Brasil.");
  } else {
    console.log({
      id: dte1694.id,
      folio: dte1694.folio,
      date: dte1694.date.toISOString().slice(0, 10),
      siiStatus: dte1694.siiStatus,
      paymentStatus: dte1694.paymentStatus,
      netAmount: dte1694.netAmount.toString(),
      taxAmount: dte1694.taxAmount.toString(),
      totalAmount: dte1694.totalAmount.toString(),
      createdAt: dte1694.createdAt.toISOString(),
    });
    console.log("\nLÍNEAS:");
    for (const l of dte1694.lines) {
      console.log({
        description: l.description,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
        isExempt: l.isExempt,
        netAmount: l.netAmount.toString(),
      });
    }
  }

  // 5) Síntesis automática para Carlos
  console.log("\n════════════════════════════════════════");
  console.log("SÍNTESIS PARA CLAUDE");
  console.log("════════════════════════════════════════");
  const monthlyAmountStr = items[0]?.amount.toString() ?? "N/A";
  const dteNet = dte1694?.netAmount.toString() ?? "N/A";
  const appliedCount = adjustments.filter((a) => a.status === "APPLIED").length;
  const pendingCount = adjustments.filter((a) => a.status === "PENDING").length;
  console.log(`Item monthlyAmount (DB):       ${monthlyAmountStr}`);
  console.log(`Factura 1694 netAmount:        ${dteNet}`);
  console.log(`Ajustes IPC APPLIED:           ${appliedCount}`);
  console.log(`Ajustes IPC PENDING:           ${pendingCount}`);
  console.log(`Ajustes IPC otros status:      ${adjustments.length - appliedCount - pendingCount}`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
