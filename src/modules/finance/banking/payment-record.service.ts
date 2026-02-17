import { prisma } from "@/lib/prisma";
import type { FinancePaymentRecordType, FinancePaymentMethod, FinanceCurrency } from "@prisma/client";

interface CreatePaymentInput {
  type: FinancePaymentRecordType;
  date: string;
  amount: number;
  currency?: FinanceCurrency;
  paymentMethod: FinancePaymentMethod;
  bankAccountId?: string;
  checkNumber?: string;
  transferReference?: string;
  supplierId?: string;
  notes?: string;
  allocations?: { dteId: string; amount: number }[];
}

export async function listPaymentRecords(
  tenantId: string,
  opts: { type?: string; page?: number; pageSize?: number; dateFrom?: string; dateTo?: string } = {}
) {
  const { type, page = 1, pageSize = 50, dateFrom, dateTo } = opts;
  const where: Record<string, unknown> = { tenantId };
  if (type) where.type = type;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }

  const [records, total] = await Promise.all([
    prisma.financePaymentRecord.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
        supplier: { select: { id: true, name: true, rut: true } },
        allocations: { include: { dte: { select: { id: true, dteType: true, folio: true, totalAmount: true } } } },
      },
      orderBy: { date: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.financePaymentRecord.count({ where }),
  ]);

  return { records, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function createPaymentRecord(tenantId: string, userId: string, data: CreatePaymentInput) {
  // Generate code
  const count = await prisma.financePaymentRecord.count({ where: { tenantId } });
  const prefix = data.type === "DISBURSEMENT" ? "PAG" : "COB";
  const code = `${prefix}-${String(count + 1).padStart(6, "0")}`;

  return prisma.$transaction(async (tx) => {
    const record = await tx.financePaymentRecord.create({
      data: {
        tenantId,
        code,
        type: data.type,
        date: new Date(data.date),
        amount: data.amount,
        currency: data.currency ?? "CLP",
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId ?? null,
        checkNumber: data.checkNumber ?? null,
        transferReference: data.transferReference ?? null,
        supplierId: data.supplierId ?? null,
        notes: data.notes ?? null,
        createdBy: userId,
        status: "PENDING",
      },
    });

    // Create allocations to DTEs if provided
    if (data.allocations?.length) {
      await tx.financePaymentAllocation.createMany({
        data: data.allocations.map((alloc) => ({
          paymentId: record.id,
          dteId: alloc.dteId,
          amount: alloc.amount,
        })),
      });

      // Update DTE payment status
      for (const alloc of data.allocations) {
        const dte = await tx.financeDte.findUnique({
          where: { id: alloc.dteId },
          select: { totalAmount: true, amountPaid: true },
        });
        if (dte) {
          const newPaid = dte.amountPaid.toNumber() + alloc.amount;
          const total = dte.totalAmount.toNumber();
          await tx.financeDte.update({
            where: { id: alloc.dteId },
            data: {
              amountPaid: newPaid,
              amountPending: total - newPaid,
              paymentStatus: newPaid >= total ? "PAID" : "PARTIAL",
            },
          });
        }
      }
    }

    return record;
  });
}

export async function confirmPayment(tenantId: string, id: string) {
  return prisma.financePaymentRecord.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
}

export async function cancelPayment(tenantId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.financePaymentRecord.findFirst({
      where: { id, tenantId },
      include: { allocations: true },
    });
    if (!record) throw new Error("Pago no encontrado");

    // Reverse DTE allocations
    for (const alloc of record.allocations) {
      const dte = await tx.financeDte.findUnique({
        where: { id: alloc.dteId },
        select: { totalAmount: true, amountPaid: true },
      });
      if (dte) {
        const newPaid = Math.max(0, dte.amountPaid.toNumber() - alloc.amount.toNumber());
        const total = dte.totalAmount.toNumber();
        await tx.financeDte.update({
          where: { id: alloc.dteId },
          data: {
            amountPaid: newPaid,
            amountPending: total - newPaid,
            paymentStatus: newPaid === 0 ? "UNPAID" : "PARTIAL",
          },
        });
      }
    }

    // Delete allocations and cancel payment
    await tx.financePaymentAllocation.deleteMany({ where: { paymentId: id } });
    return tx.financePaymentRecord.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  });
}
