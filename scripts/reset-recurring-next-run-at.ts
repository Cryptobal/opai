/**
 * Reset de nextRunAt para plantillas recurrentes afectadas por el bug
 * de stale lastRunAt (issue del 20/may/2026).
 *
 * Estrategia:
 *  - Para cada plantilla activa con nextRunAt vencido o nulo (excluyendo
 *    las que aún no corrieron nunca, esas están OK), recomputar nextRunAt
 *    usando el FIX de computeNextRunAt con fromDate=lastRunAt o today.
 *  - Si el cálculo da una fecha en el pasado, avanzar hasta superar today.
 *  - Si pasó endDate, desactivar plantilla.
 *
 * Uso:
 *   npx tsx scripts/reset-recurring-next-run-at.ts --dry-run
 *   npx tsx scripts/reset-recurring-next-run-at.ts --apply
 */
import { prisma } from "@/lib/prisma";
import { computeNextRunAt } from "@/modules/finance/billing/dte-recurring.service";

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const templates = await prisma.financeDteRecurringTemplate.findMany({
    where: {
      isActive: true,
      OR: [
        { nextRunAt: null },
        { nextRunAt: { lt: today } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      frequency: true,
      dayOfMonth: true,
      dayOfWeek: true,
      monthOfYear: true,
      startDate: true,
      endDate: true,
      lastRunAt: true,
      nextRunAt: true,
    },
  });

  console.log(`[reset] ${dryRun ? "DRY-RUN" : "APPLY"} — ${templates.length} plantillas candidatas`);

  let updated = 0;
  let deactivated = 0;

  for (const t of templates) {
    // Si nunca corrió, el nextRunAt original ya es correcto (= startDate o
    // primer hit). No tocar.
    if (!t.lastRunAt) {
      console.log(
        `  SKIP ${t.id} (${t.name}): nunca corrió, nextRunAt=${t.nextRunAt?.toISOString().slice(0, 10) ?? "null"} OK`,
      );
      continue;
    }

    // Recomputar usando lastRunAt como ancla, con FIX nuevo.
    let next = computeNextRunAt({
      frequency: t.frequency,
      dayOfMonth: t.dayOfMonth,
      dayOfWeek: t.dayOfWeek,
      monthOfYear: t.monthOfYear,
      startDate: t.startDate,
      endDate: t.endDate,
      lastRunAt: t.lastRunAt,
    });

    // Loop de seguridad: avanzar hasta que next > today
    let safety = 0;
    while (next != null && next <= today && safety < 24) {
      next = computeNextRunAt({
        frequency: t.frequency,
        dayOfMonth: t.dayOfMonth,
        dayOfWeek: t.dayOfWeek,
        monthOfYear: t.monthOfYear,
        startDate: t.startDate,
        endDate: t.endDate,
        lastRunAt: next,
      });
      safety += 1;
    }

    const action = next == null ? "DEACTIVATE" : "UPDATE";
    console.log(
      `  ${action} ${t.id} (${t.name}): ` +
        `${t.nextRunAt?.toISOString().slice(0, 10) ?? "null"} → ` +
        `${next?.toISOString().slice(0, 10) ?? "null"}`,
    );

    if (apply) {
      await prisma.financeDteRecurringTemplate.update({
        where: { id: t.id },
        data: {
          nextRunAt: next,
          ...(next == null ? { isActive: false } : {}),
        },
      });
      if (next == null) deactivated += 1;
      else updated += 1;
    }
  }

  console.log(`\n[reset] Done. updated=${updated} deactivated=${deactivated} (apply=${apply})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
