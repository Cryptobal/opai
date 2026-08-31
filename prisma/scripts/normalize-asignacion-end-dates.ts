/**
 * Normaliza `endDate` legado de `OpsAsignacionGuardia` a la convención inclusiva.
 *
 * Pares del mismo guardia (mismo tenant) donde `prev.endDate == next.startDate`
 * → `prev.endDate = next.startDate − 1`.
 *
 * Dry-run por defecto (imprime conteo y muestra). `--apply` escribe.
 * `--tenant=<slug>` limita a un tenant.
 *
 * NO ejecutar contra producción sin instrucción explícita de Carlos.
 *
 * Usage:
 *   npx tsx prisma/scripts/normalize-asignacion-end-dates.ts
 *   npx tsx prisma/scripts/normalize-asignacion-end-dates.ts --apply
 *   npx tsx prisma/scripts/normalize-asignacion-end-dates.ts --tenant=gard --apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function addDaysUtc(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="));
  const tenantSlug = tenantArg ? tenantArg.slice("--tenant=".length) : null;

  const tenants = await prisma.tenant.findMany({
    where: tenantSlug ? { slug: tenantSlug } : {},
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });

  if (tenants.length === 0) {
    console.log(tenantSlug ? `Sin tenant slug=${tenantSlug}` : "Sin tenants");
    return;
  }

  console.log(apply ? "MODO APPLY — se escribirán cambios" : "Dry-run (no escribe). Pasa --apply para persistir.");
  console.log(`Tenants: ${tenants.length}\n`);

  let totalPairs = 0;
  let totalUpdated = 0;

  for (const tenant of tenants) {
    const rows = await prisma.opsAsignacionGuardia.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        guardiaId: true,
        startDate: true,
        endDate: true,
      },
      orderBy: [{ guardiaId: "asc" }, { startDate: "asc" }, { createdAt: "asc" }],
    });

    const byGuardia = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byGuardia.get(row.guardiaId) ?? [];
      list.push(row);
      byGuardia.set(row.guardiaId, list);
    }

    type Pair = { prevId: string; nextId: string; from: string; to: string; guardiaId: string };
    const pairs: Pair[] = [];
    for (const [guardiaId, list] of byGuardia) {
      for (let i = 0; i < list.length - 1; i++) {
        const prev = list[i]!;
        const next = list[i + 1]!;
        if (!prev.endDate) continue;
        if (prev.endDate.getTime() !== next.startDate.getTime()) continue;
        pairs.push({
          prevId: prev.id,
          nextId: next.id,
          from: ymd(prev.endDate),
          to: ymd(addDaysUtc(next.startDate, -1)),
          guardiaId,
        });
      }
    }

    totalPairs += pairs.length;
    console.log(`[${tenant.slug}] ${pairs.length} pares endDate == startDate siguiente`);
    for (const p of pairs.slice(0, 10)) {
      console.log(`  ${p.prevId} ${p.from} → ${p.to} (next ${p.nextId}, guardia ${p.guardiaId})`);
    }
    if (pairs.length > 10) console.log(`  … +${pairs.length - 10} más`);

    if (apply && pairs.length > 0) {
      for (const p of pairs) {
        await prisma.opsAsignacionGuardia.update({
          where: { id: p.prevId },
          data: { endDate: addDaysUtc(new Date(`${p.from}T00:00:00.000Z`), -1) },
        });
      }
      totalUpdated += pairs.length;
    }
  }

  console.log(`\nTotal pares: ${totalPairs}${apply ? ` · actualizados: ${totalUpdated}` : " · sin escribir"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
