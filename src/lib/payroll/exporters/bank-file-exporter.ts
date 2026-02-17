/**
 * Bank Payment File Exporter
 * Generates CSV for bulk bank payments (TEF).
 * Standard format compatible with major Chilean banks (BCI, Santander, BancoEstado).
 */

import { prisma } from "@/lib/prisma";

export async function generateBankFile(
  periodId: string,
  tenantId: string,
  type: "sueldos" | "anticipos" = "sueldos"
): Promise<string> {
  const HEADER = "RUT;Nombre;Banco;TipoCuenta;NumeroCuenta;Monto;Email;Concepto";

  if (type === "anticipos") {
    const items = await prisma.payrollAnticipoItem.findMany({
      where: {
        anticipoProcess: { periodId, tenantId },
        status: { in: ["PENDING", "PAID"] },
      },
      select: {
        guardiaId: true,
        amount: true,
      },
    });

    const guardIds = items.map((i) => i.guardiaId);
    const guardData = await getGuardBankData(guardIds);

    const rows: string[] = [HEADER];
    for (const item of items) {
      const g = guardData.get(item.guardiaId);
      if (!g) continue;
      rows.push([
        g.rut,
        g.name,
        g.bankName,
        g.accountType,
        g.accountNumber,
        Number(item.amount),
        g.email,
        "ANTICIPO",
      ].join(";"));
    }
    return rows.join("\n");
  }

  // Sueldos
  const liquidaciones = await prisma.payrollLiquidacion.findMany({
    where: { periodId, tenantId, status: { in: ["DRAFT", "APPROVED", "PAID"] } },
    select: { guardiaId: true, netSalary: true },
  });

  const guardIds = liquidaciones.map((l) => l.guardiaId);
  const guardData = await getGuardBankData(guardIds);

  const rows: string[] = [HEADER];
  for (const liq of liquidaciones) {
    const g = guardData.get(liq.guardiaId);
    if (!g) continue;
    rows.push([
      g.rut,
      g.name,
      g.bankName,
      g.accountType,
      g.accountNumber,
      Number(liq.netSalary),
      g.email,
      "SUELDO",
    ].join(";"));
  }

  return rows.join("\n");
}

async function getGuardBankData(guardIds: string[]) {
  const guardias = await prisma.opsGuardia.findMany({
    where: { id: { in: guardIds } },
    select: {
      id: true,
      persona: {
        select: { rut: true, firstName: true, lastName: true, email: true },
      },
      bankAccounts: {
        where: { isDefault: true },
        take: 1,
        select: { bankName: true, accountType: true, accountNumber: true },
      },
    },
  });

  return new Map(
    guardias.map((g) => [
      g.id,
      {
        rut: g.persona.rut || "",
        name: `${g.persona.firstName} ${g.persona.lastName}`,
        email: g.persona.email || "",
        bankName: g.bankAccounts[0]?.bankName || "",
        accountType: g.bankAccounts[0]?.accountType || "",
        accountNumber: g.bankAccounts[0]?.accountNumber || "",
      },
    ])
  );
}
