/**
 * Audita DTEs de gard que tienen paymentStatus=PAID pero amountPaid=0
 * y creditedNetAmount > 0. Esos son falsos positivos: la NC los marcó
 * como pagados sin haber recibido pago real.
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register --compiler-options '{"module":"CommonJS"}' \
 *     scripts/audit-paid-by-credit-note.ts
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  // Localizar tenant gard por slug o nombre.
  const tenant = await prisma.tenant.findFirst({
    where: { OR: [{ slug: "gard" }, { name: { contains: "Gard", mode: "insensitive" } }] },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant gard no encontrado");
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  const suspects = await prisma.financeDte.findMany({
    where: {
      tenantId: tenant.id,
      direction: "ISSUED",
      paymentStatus: "PAID",
      amountPaid: 0,
      creditedNetAmount: { gt: 0 },
      reconciledAt: null,
    },
    select: {
      id: true,
      folio: true,
      receiverName: true,
      totalAmount: true,
      amountPaid: true,
      amountPending: true,
      creditedNetAmount: true,
      paymentStatus: true,
      date: true,
      voidedByCreditNoteId: true,
    },
    orderBy: { folio: "desc" },
    take: 50,
  });

  console.log(`\nDTEs sospechosos (PAID + amountPaid=0 + creditedNetAmount>0): ${suspects.length}`);
  console.log("--------------------------------------------------------------------");
  for (const d of suspects) {
    console.log(
      `  F#${d.folio} · ${d.receiverName?.substring(0, 40)} · ` +
        `total=${d.totalAmount} pending=${d.amountPending} ` +
        `creditedNet=${d.creditedNetAmount} status=${d.paymentStatus}`,
    );
  }

  // Caso específico: factura 1614
  const f1614 = suspects.find((d) => d.folio === 1614);
  if (f1614) {
    console.log("\n⚠️  Factura 1614 confirma el bug:");
    console.log(JSON.stringify(f1614, null, 2));
  } else {
    console.log("\n(Factura 1614 no aparece como sospechosa — revisar manualmente)");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
