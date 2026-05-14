import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const tenant = await prisma.tenant.findFirst({ where: { slug: "gard" } });
if (!tenant) throw new Error("tenant gard no encontrado");
console.log(`Tenant gard: ${tenant.id}`);

const tenantDteCfg = await prisma.tenantDteConfig.findUnique({
  where: { tenantId: tenant.id },
  select: { emisorRut: true, emisorRazonSocial: true, isActive: true },
});
console.log(`DTE config: ${JSON.stringify(tenantDteCfg)}`);

const issuedCount = await prisma.financeDte.count({
  where: { tenantId: tenant.id, direction: "ISSUED" },
});
const folios = await prisma.financeDte.findMany({
  where: { tenantId: tenant.id, direction: "ISSUED" },
  select: { dteType: true, folio: true, siiStatus: true },
});
const byType = new Map();
for (const f of folios) {
  const k = f.dteType;
  if (!byType.has(k)) byType.set(k, { count: 0, min: Infinity, max: -Infinity });
  const b = byType.get(k);
  b.count++;
  b.min = Math.min(b.min, f.folio);
  b.max = Math.max(b.max, f.folio);
}
console.log(`\n=== Facturas ISSUED existentes en DB tenant gard ===`);
console.log(`Total: ${issuedCount}`);
for (const [type, info] of byType) {
  console.log(`  dteType=${type}: ${info.count} (folios ${info.min} → ${info.max})`);
}

const crmCount = await prisma.crmAccount.count({ where: { tenantId: tenant.id } });
const crm = await prisma.crmAccount.findMany({
  where: { tenantId: tenant.id, rut: { not: null } },
  select: { id: true, rut: true, legalName: true, name: true },
  orderBy: { legalName: "asc" },
});
console.log(`\n=== CrmAccount tenant gard ===`);
console.log(`Total: ${crmCount} | con RUT: ${crm.length}`);
console.log("Todos con RUT:");
crm.forEach((a) => console.log(`  ${a.rut}\t${a.legalName ?? "-"}\t(${a.name ?? "-"})`));

// también: compara folios existentes vs CSV
const existing = new Set(folios.filter((f) => f.dteType === 33).map((f) => f.folio));
console.log(`\n=== Folios 33 existentes en DB: ${existing.size} ===`);
console.log(`Rango: ${Math.min(...existing)} → ${Math.max(...existing)}`);

const existingNc = new Set(folios.filter((f) => f.dteType === 61).map((f) => f.folio));
console.log(`Folios 61 (NC) existentes: ${existingNc.size}`);
console.log(`Rango: ${Math.min(...existingNc)} → ${Math.max(...existingNc)}`);

// sample para ver qué tienen y qué les falta
const sample = await prisma.financeDte.findFirst({
  where: { tenantId: tenant.id, direction: "ISSUED", dteType: 33, folio: 1300 },
  select: {
    folio: true, dueDate: true, xmlUrl: true, pdfUrl: true,
    receiverGiro: true, receiverDireccion: true,
    paymentStatus: true, amountPending: true,
    notes: true, createdBy: true,
    factoringOps: { select: { factoringCompany: true } },
    lines: { select: { itemName: true, description: true } },
  },
});
console.log(`\n=== Sample folio 1300 ===`);
console.log(JSON.stringify(sample, null, 2));

await prisma.$disconnect();
