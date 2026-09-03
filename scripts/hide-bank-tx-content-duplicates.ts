/**
 * Oculta movimientos bancarios duplicados por huella de contenido
 * (fecha + monto + glosa + referencia), conservando MATCHED / el más antiguo.
 *
 * Uso:
 *   npx tsx scripts/hide-bank-tx-content-duplicates.ts <accountNumber>
 *   npx tsx scripts/hide-bank-tx-content-duplicates.ts 94541158
 */
import { prisma } from "../src/lib/prisma";
import { hideContentDuplicateBankTransactions } from "../src/modules/finance/banking/bank-tx-dedupe.service";

async function main() {
  const accountNumber = process.argv[2];
  if (!accountNumber) {
    console.error(
      "Uso: npx tsx scripts/hide-bank-tx-content-duplicates.ts <accountNumber>",
    );
    process.exit(1);
  }

  const accounts = await prisma.financeBankAccount.findMany({
    where: { accountNumber, isActive: true },
    select: { id: true, tenantId: true, bankName: true, accountNumber: true },
  });
  if (accounts.length === 0) {
    console.error(`No hay cuenta activa ${accountNumber}`);
    process.exit(1);
  }

  for (const acc of accounts) {
    const r = await hideContentDuplicateBankTransactions({
      tenantId: acc.tenantId,
      bankAccountId: acc.id,
    });
    console.log(
      `${acc.bankName} ${acc.accountNumber}: ocultos=${r.hidden} grupos=${r.groups}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
