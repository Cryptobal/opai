/**
 * DIAGNÓSTICO (solo lectura) del estado de las etapas de cierre por tenant.
 *
 * No escribe nada. Imprime, por tenant con etapas de cierre:
 *   - todas las etapas con flags (isAccepted / isClosedWon / isClosedLost),
 *     orden, y conteo de negocios;
 *   - de las etapas "ganadoras" (isClosedWon o isAccepted o nombre Ganado/Adjudicado),
 *     cuántos negocios tiene, con y sin serviceStartDate, y el status real.
 *
 * Uso:
 *   npx tsx scripts/diagnose-won-stages.ts             # todos los tenants
 *   npx tsx scripts/diagnose-won-stages.ts --tenant <id>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tenantArgIdx = process.argv.indexOf("--tenant");
const ONLY_TENANT = tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : null;

function isWonName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ganad") || n.includes("adjudicad") || n.includes("activ");
}

async function main() {
  const tenants = ONLY_TENANT
    ? await prisma.tenant.findMany({ where: { id: ONLY_TENANT }, select: { id: true, name: true } })
    : await prisma.tenant.findMany({ select: { id: true, name: true } });

  console.log(`Diagnóstico de etapas de cierre · ${tenants.length} tenant(s) · SOLO LECTURA\n`);

  for (const t of tenants) {
    const stages = await prisma.crmPipelineStage.findMany({
      where: { tenantId: t.id },
      select: {
        id: true, name: true, order: true, isActive: true,
        isAccepted: true, isClosedWon: true, isClosedLost: true,
        _count: { select: { deals: true } },
      },
      orderBy: { order: "asc" },
    });
    const won = stages.filter((s) => s.isClosedWon || s.isAccepted || isWonName(s.name));
    if (won.length === 0) continue;

    console.log(`\n════════ Tenant "${t.name}" (${t.id}) ════════`);
    for (const s of stages) {
      const flags = [
        s.isAccepted ? "isAccepted" : null,
        s.isClosedWon ? "isClosedWon" : null,
        s.isClosedLost ? "isClosedLost" : null,
        s.isActive ? null : "INACTIVE",
      ].filter(Boolean).join(", ") || "—";
      console.log(`  [ord ${String(s.order).padStart(2)}] ${s.name.padEnd(24)} negocios:${String(s._count.deals).padStart(4)}  {${flags}}`);
    }

    console.log(`  ── detalle de etapas de cierre ──`);
    for (const s of won) {
      const [total, withStart, statuses] = await Promise.all([
        prisma.crmDeal.count({ where: { tenantId: t.id, stageId: s.id } }),
        prisma.crmDeal.count({ where: { tenantId: t.id, stageId: s.id, serviceStartDate: { not: null } } }),
        prisma.crmDeal.groupBy({ by: ["status"], where: { tenantId: t.id, stageId: s.id }, _count: { _all: true } }),
      ]);
      const st = statuses.map((x) => `${x.status}:${x._count._all}`).join(" ") || "—";
      console.log(`    "${s.name}" → ${total} negocios · con fecha inicio: ${withStart} · status[${st}]`);
    }
  }

  console.log(`\nFin del diagnóstico (no se escribió nada).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
