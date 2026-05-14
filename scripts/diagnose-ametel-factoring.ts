import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const dte = await prisma.financeDte.findFirst({
    where: { folio: 1589 },
    select: {
      id: true,
      folio: true,
      receiverName: true,
      netAmount: true,
      exemptAmount: true,
      taxAmount: true,
      totalAmount: true,
      paymentStatus: true,
      siiStatus: true,
    },
  });
  console.log("DTE folio 1589:", dte);
  if (!dte) return;

  const factoring = await prisma.financeFactoringOperation.findMany({
    where: { dteId: dte.id },
    select: {
      id: true,
      status: true,
      grossAmount: true,
      netAmountToCedente: true,
      discountAmount: true,
      operationDate: true,
    },
  });
  console.log("Factoring ops linked:", factoring);

  const links = await prisma.financeBankTransactionLink.findMany({
    where: { targetId: dte.id },
    select: {
      bankTransactionId: true,
      amount: true,
      targetType: true,
      bankTransaction: { select: { transactionDate: true, amount: true, description: true } },
    },
  });
  console.log("Bank tx links:", JSON.stringify(links, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
