/**
 * Backfill capa 1 (feature "período por programación"). Best-effort para los
 * DTEs existentes: período = mes de la factura; recurringTemplateId derivado del
 * run o del item RECURRING_DTE que matchea por instalación/cliente. Los que no
 * matchean ninguna programación quedan EXTRA (ambos null). De aquí en adelante
 * el valor se declara explícito en el editor de borrador (obligatorio).
 * READ→WRITE. Idempotente: solo setea los que aún no tienen billingPeriod.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const TENANT = "clgard00000000000000001";
function ym(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`; }
async function main() {
  const dtes = await prisma.financeDte.findMany({
    where: { tenantId: TENANT, direction: "ISSUED", dteType: { in: [33,34] }, voidedByCreditNoteId: null, siiStatus: { notIn: ["ANNULLED","REJECTED"] } },
    select: { id: true, date: true, crmAccountId: true, installationId: true },
  });
  const runs = await prisma.financeDteRecurringRun.findMany({ where: { tenantId: TENANT, dteId: { in: dtes.map(d=>d.id) } }, select: { dteId: true, templateId: true } });
  const tplByDte = new Map(runs.map(r=>[r.dteId!, r.templateId]));
  const items = await prisma.financeCashflowItem.findMany({ where: { tenantId: TENANT, isActive: true, kind: "INCOME", source: { in: ["CONTRACT","RECURRING_DTE"] } }, select: { source: true, sourceRefId: true, installationId: true, crmAccountId: true } });
  const instSet = new Set<string>(), crmSet = new Set<string>(), tplByInst = new Map<string,string>(), tplByCrm = new Map<string,string>();
  for (const it of items) {
    if (it.installationId) { instSet.add(it.installationId); if (it.source==="RECURRING_DTE" && it.sourceRefId) tplByInst.set(it.installationId, it.sourceRefId); }
    if (it.crmAccountId) { crmSet.add(it.crmAccountId); if (it.source==="RECURRING_DTE" && it.sourceRefId) tplByCrm.set(it.crmAccountId, it.sourceRefId); }
  }
  let updated=0, extra=0;
  for (const d of dtes) {
    const matches = (d.installationId && instSet.has(d.installationId)) || (d.crmAccountId && crmSet.has(d.crmAccountId));
    if (!matches) { extra++; continue; }
    const billingPeriod = ym(d.date);
    const recurringTemplateId = (tplByDte.get(d.id) ?? (d.installationId && tplByInst.get(d.installationId)) ?? (d.crmAccountId && tplByCrm.get(d.crmAccountId)) ?? null) as string|null;
    await prisma.financeDte.update({ where: { id: d.id }, data: { billingPeriod, recurringTemplateId } });
    updated++;
  }
  const withPeriod = await prisma.financeDte.count({ where: { tenantId: TENANT, billingPeriod: { not: null } } });
  const withTpl = await prisma.financeDte.count({ where: { tenantId: TENANT, recurringTemplateId: { not: null } } });
  console.log(`Backfill OK · cuotas seteadas: ${updated} · extra (sin tocar): ${extra}`);
  console.log(`Verificación · con billingPeriod: ${withPeriod} · con recurringTemplateId: ${withTpl}`);
}
main().then(()=>prisma.$disconnect()).catch(e=>{console.error(String(e).slice(0,400));return prisma.$disconnect().then(()=>process.exit(1));});
