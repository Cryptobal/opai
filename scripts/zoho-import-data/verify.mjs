import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const t = await prisma.tenant.findFirst({ where: { slug: "gard" } });
const tenantId = t.id;

const counts = await prisma.financeDte.groupBy({
  by: ["dteType", "paymentStatus"],
  where: { tenantId, direction: "ISSUED" },
  _count: true,
  orderBy: [{ dteType: "asc" }, { paymentStatus: "asc" }],
});
console.log("=== Distribución por tipo y paymentStatus ===");
for (const c of counts) {
  console.log(`  dte=${c.dteType}  status=${c.paymentStatus.padEnd(10)} ${c._count}`);
}

const enrichedSample = await prisma.financeDte.findFirst({
  where: { tenantId, direction: "ISSUED", dteType: 33, folio: 1300 },
  include: {
    lines: { take: 3 },
    factoringOps: true,
  },
});
console.log("\n=== Sample folio 1300 (post-enrich) ===");
console.log(JSON.stringify({
  folio: enrichedSample.folio,
  dueDate: enrichedSample.dueDate,
  xmlUrl: enrichedSample.xmlUrl,
  receiverGiro: enrichedSample.receiverGiro,
  receiverDireccion: enrichedSample.receiverDireccion,
  receiverComuna: enrichedSample.receiverComuna,
  paymentStatus: enrichedSample.paymentStatus,
  amountPaid: enrichedSample.amountPaid,
  amountPending: enrichedSample.amountPending,
  notes: enrichedSample.notes,
  numLines: enrichedSample.lines.length,
  lineSamples: enrichedSample.lines.map(l => ({ name: l.itemName, desc: l.description?.slice(0, 80) })),
  factoringOps: enrichedSample.factoringOps.length,
}, null, 2));

const cededSample = await prisma.financeDte.findFirst({
  where: { tenantId, direction: "ISSUED", paymentStatus: "CEDED" },
  include: { factoringOps: { take: 1 } },
});
console.log("\n=== Sample CEDED ===");
if (cededSample) {
  console.log(JSON.stringify({
    folio: cededSample.folio,
    dteType: cededSample.dteType,
    paymentStatus: cededSample.paymentStatus,
    factoring: cededSample.factoringOps[0] ? {
      company: cededSample.factoringOps[0].factoringCompany,
      status: cededSample.factoringOps[0].status,
      cessionDate: cededSample.factoringOps[0].cessionDate,
      amount: cededSample.factoringOps[0].invoiceAmount,
    } : null,
  }, null, 2));
}

const ncWithRef = await prisma.financeDte.findFirst({
  where: { tenantId, direction: "ISSUED", dteType: 61, referenceDteId: { not: null } },
  include: { referenceDte: { select: { folio: true, dteType: true, receiverName: true } } },
});
console.log("\n=== Sample NC con referencia ===");
if (ncWithRef) {
  console.log(JSON.stringify({
    ncFolio: ncWithRef.folio,
    refDteType: ncWithRef.referenceType,
    refFolio: ncWithRef.referenceFolio,
    refResolvedDte: ncWithRef.referenceDte,
    receiverName: ncWithRef.receiverName,
  }, null, 2));
}

const totalEnrichedZoho = await prisma.financeDte.count({
  where: { tenantId, direction: "ISSUED", xmlUrl: { not: null } },
});
const totalDte = await prisma.financeDte.count({
  where: { tenantId, direction: "ISSUED" },
});
console.log(`\n=== Total ISSUED con xmlUrl: ${totalEnrichedZoho} / ${totalDte} ===`);

await prisma.$disconnect();
