/**
 * Diff de equivalencia numérica de la matriz flow-v3 (plan/committed/real).
 *
 * Uso (contra un tenant con datos reales, p.ej. Gard Security SpA):
 *   BEFORE_FILE=/tmp/matrix-before.json npx tsx prisma/scripts/diff-flow-matrix.ts --capture
 *   # aplicar migración + backfill
 *   BEFORE_FILE=/tmp/matrix-before.json npx tsx prisma/scripts/diff-flow-matrix.ts --diff
 *
 * Ventana por defecto: 12 semanas pasadas + 8 futuras.
 * Cualquier diferencia en plan/committed/real es fallo del brief.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, readFileSync, existsSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const capture = args.includes("--capture");
  const diff = args.includes("--diff");
  const tenantArg = args.find((a) => a.startsWith("--tenant="));
  const file = process.env.BEFORE_FILE ?? "/tmp/matrix-before.json";

  if (!capture && !diff) {
    console.error("Usar --capture o --diff");
    process.exit(1);
  }

  // Import dinámico del service (requiere env + path aliases vía tsx + tsconfig).
  const { buildFlowMatrix } = await import(
    "../../src/modules/finance/flow-v3/matrix.service"
  );
  const { startOfIsoWeekUTC, addWeeksUTC } = await import(
    "../../src/modules/finance/flow-v3/weeks"
  );

  const tenantId =
    tenantArg?.slice("--tenant=".length) ??
    (
      await prisma.tenant.findFirst({
        where: { name: { contains: "Gard", mode: "insensitive" } },
        select: { id: true, name: true },
      })
    )?.id;

  if (!tenantId) {
    console.error("Tenant no encontrado");
    process.exit(1);
  }

  const today = new Date();
  const from = addWeeksUTC(startOfIsoWeekUTC(today), -12);
  const to = addWeeksUTC(startOfIsoWeekUTC(today), 8);

  const matrix = await buildFlowMatrix(tenantId, {
    from,
    to,
    granularity: "week",
    allowBootstrap: false,
  });

  const snapshot = {
    tenantId,
    from: from.toISOString(),
    to: to.toISOString(),
    rows: matrix.rows.map((r) => ({
      id: r.id,
      name: r.name,
      section: r.section,
      cells: r.cells.map((c) => ({
        weekStart: c.weekStart,
        plan: c.plan,
        committed: c.committed,
        real: c.real,
      })),
    })),
  };

  if (capture) {
    writeFileSync(file, JSON.stringify(snapshot, null, 2));
    console.log(`Captured ${snapshot.rows.length} rows → ${file}`);
    return;
  }

  if (!existsSync(file)) {
    console.error(`Missing ${file}; run --capture first`);
    process.exit(1);
  }

  const before = JSON.parse(readFileSync(file, "utf8")) as typeof snapshot;
  const diffs: string[] = [];
  const beforeById = new Map(before.rows.map((r) => [r.id, r]));
  const afterById = new Map(snapshot.rows.map((r) => [r.id, r]));

  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const a = beforeById.get(id);
    const b = afterById.get(id);
    if (!a || !b) {
      diffs.push(`row ${id}: ${!a ? "missing before" : "missing after"}`);
      continue;
    }
    const aCells = new Map(a.cells.map((c) => [c.weekStart, c]));
    const bCells = new Map(b.cells.map((c) => [c.weekStart, c]));
    for (const w of new Set([...aCells.keys(), ...bCells.keys()])) {
      const ca = aCells.get(w);
      const cb = bCells.get(w);
      for (const layer of ["plan", "committed", "real"] as const) {
        const va = ca?.[layer] ?? 0;
        const vb = cb?.[layer] ?? 0;
        if (va !== vb) {
          diffs.push(
            `${a.name} (${id}) ${w} ${layer}: ${va} → ${vb}`,
          );
        }
      }
    }
  }

  if (diffs.length === 0) {
    console.log("EQUIVALENCE OK — 0 diffs in plan/committed/real");
  } else {
    console.error(`EQUIVALENCE FAIL — ${diffs.length} diffs`);
    console.error(diffs.slice(0, 50).join("\n"));
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
