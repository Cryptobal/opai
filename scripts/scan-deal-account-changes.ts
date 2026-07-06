/**
 * Barrido (solo lectura) de TODOS los cambios de cuenta (accountId) de negocios,
 * para detectar reasignaciones por error (mis-click en el editor).
 *
 * Para cada negocio cuyo historial tenga un cambio de accountId, imprime:
 *   - cuenta actual, correo del contacto principal, y si el dominio del correo
 *     "coincide" con la cuenta actual (heurística);
 *   - la cadena de cambios from→to (con nombres) y quién/cuándo.
 * Marca 🚩 los sospechosos: el dominio del correo NO coincide con la cuenta
 * actual pero SÍ con alguna cuenta previa del historial.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const TENANT = "clgard00000000000000001";

function domainCore(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const dom = email.split("@")[1].toLowerCase();
  if (/(gmail|hotmail|outlook|yahoo|icloud|live)\./.test(dom)) return null; // genéricos: no sirven
  return dom.split(".")[0]; // "angloamerican.com" → "angloamerican"
}
function norm(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function matches(core: string | null, accountName: string | undefined): boolean {
  if (!core || !accountName) return false;
  const a = norm(accountName);
  return a.includes(core) || core.includes(a.slice(0, Math.min(6, a.length)));
}

async function main() {
  const logs = await prisma.crmHistoryLog.findMany({
    where: { tenantId: TENANT, entityType: "deal", action: "deal_updated" },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, details: true, createdBy: true, createdAt: true },
  });
  // deal → lista de cambios de accountId
  const byDeal = new Map<string, Array<{ from: string | null; to: string | null; at: Date; by: string | null }>>();
  for (const l of logs) {
    const d = l.details as any;
    const ch = d?.changes?.accountId;
    if (!ch) continue;
    if (!byDeal.has(l.entityId)) byDeal.set(l.entityId, []);
    byDeal.get(l.entityId)!.push({ from: ch.from ?? null, to: ch.to ?? null, at: l.createdAt, by: l.createdBy ?? null });
  }
  if (byDeal.size === 0) { console.log("No hay cambios de accountId registrados."); return; }

  // Resolver nombres de todas las cuentas y admins referenciados.
  const acctIds = new Set<string>();
  for (const arr of byDeal.values()) for (const c of arr) { if (c.from) acctIds.add(c.from); if (c.to) acctIds.add(c.to); }
  const deals = await prisma.crmDeal.findMany({
    where: { id: { in: [...byDeal.keys()] } },
    select: { id: true, title: true, accountId: true, account: { select: { name: true } }, primaryContact: { select: { email: true } } },
  });
  const dealById = new Map(deals.map((d) => [d.id, d]));
  for (const d of deals) if (d.accountId) acctIds.add(d.accountId);
  const accts = await prisma.crmAccount.findMany({ where: { id: { in: [...acctIds] } }, select: { id: true, name: true } });
  const acctName = new Map(accts.map((a) => [a.id, a.name]));
  const byIds = [...new Set([...byDeal.values()].flatMap((a) => a.map((c) => c.by)).filter(Boolean))] as string[];
  const admins = await prisma.admin.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } });
  const adminName = new Map(admins.map((a) => [a.id, a.name]));

  let suspects = 0;
  console.log(`Negocios con cambio de cuenta: ${byDeal.size}\n`);
  for (const [dealId, changes] of byDeal) {
    const d = dealById.get(dealId);
    if (!d) continue;
    const core = domainCore(d.primaryContact?.email);
    const currentOk = matches(core, d.account?.name);
    // ¿alguna cuenta previa coincide con el dominio del correo?
    const prevIds = [...new Set(changes.map((c) => c.from).filter(Boolean))] as string[];
    const prevMatch = prevIds.find((id) => matches(core, acctName.get(id)));
    const suspect = !!core && !currentOk && !!prevMatch;
    if (suspect) suspects++;
    console.log(`${suspect ? "🚩" : "  "} "${d.title}" · cuenta actual: "${d.account?.name}" · correo: ${d.primaryContact?.email ?? "—"}${core ? ` (dominio: ${core}${currentOk ? " ✓coincide" : " ✗no coincide"})` : ""}`);
    for (const c of changes) {
      console.log(`      ${c.at.toISOString()} · ${acctName.get(c.from ?? "") ?? c.from} → ${acctName.get(c.to ?? "") ?? c.to} · by ${adminName.get(c.by ?? "") ?? c.by}`);
    }
    if (suspect) console.log(`      → SUGERENCIA: revertir a "${acctName.get(prevMatch!)}" (${prevMatch})`);
  }
  console.log(`\nSospechosos (🚩): ${suspects}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
