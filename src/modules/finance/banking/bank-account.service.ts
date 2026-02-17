import { prisma } from "@/lib/prisma";
import type { FinanceBankAccountType, FinanceCurrency } from "@prisma/client";

interface CreateBankAccountInput {
  bankCode: string;
  bankName: string;
  accountType: FinanceBankAccountType;
  accountNumber: string;
  currency?: FinanceCurrency;
  holderName: string;
  holderRut: string;
  accountPlanId?: string;
  isDefault?: boolean;
}

export async function listBankAccounts(tenantId: string) {
  return prisma.financeBankAccount.findMany({
    where: { tenantId },
    include: { accountPlan: { select: { id: true, code: true, name: true } } },
    orderBy: { bankName: "asc" },
  });
}

export async function getBankAccount(tenantId: string, id: string) {
  return prisma.financeBankAccount.findFirst({
    where: { tenantId, id },
    include: {
      accountPlan: { select: { id: true, code: true, name: true } },
      transactions: { orderBy: { transactionDate: "desc" }, take: 10 },
    },
  });
}

export async function createBankAccount(
  tenantId: string,
  data: CreateBankAccountInput
) {
  if (data.isDefault) {
    await prisma.financeBankAccount.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }
  return prisma.financeBankAccount.create({ data: { tenantId, ...data } });
}

export async function updateBankAccount(
  tenantId: string,
  id: string,
  data: Partial<CreateBankAccountInput>
) {
  if (data.isDefault) {
    await prisma.financeBankAccount.updateMany({
      where: { tenantId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }
  return prisma.financeBankAccount.update({ where: { id }, data });
}

export async function deleteBankAccount(tenantId: string, id: string) {
  const txCount = await prisma.financeBankTransaction.count({
    where: { bankAccountId: id },
  });
  if (txCount > 0)
    throw new Error(
      "No se puede eliminar una cuenta con movimientos asociados"
    );
  return prisma.financeBankAccount.delete({ where: { id } });
}
