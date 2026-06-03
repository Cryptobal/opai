/**
 * Auditoría instalación × instalación (standalone, sin server-only).
 * Uso: npx tsx scripts/audit-recurring-fc-by-installation.ts --tenant gard --month 2026-06
 */
import { PrismaClient } from "@prisma/client";
import {
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  endOfISOWeek,
  startOfDay,
  lastDayOfMonth,
  setDate,
  addMonths,
  isAfter,
  isBefore,
  endOfDay,
  getYear,
  getMonth,
  getDate,
} from "date-fns";

const prisma = new PrismaClient();

function utcCalendarDay(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function bucketKeyFor(date: Date): string {
  const dd = utcCalendarDay(date);
  const w = String(getISOWeek(dd)).padStart(2, "0");
  return `${getISOWeekYear(dd)}-W${w}`;
}

function bucketBoundsFor(date: Date): { start: Date; end: Date; label: string } {
  const dd = utcCalendarDay(date);
  const start = startOfISOWeek(dd);
  const end = endOfISOWeek(dd);
  return { start, end, label: `Sem ${getISOWeek(dd)}` };
}

function expandMonthlyDayOfMonth(
  dayOfMonth: number,
  startDate: Date,
  endDate: Date | null,
  from: Date,
  to: Date,
): Date[] {
  const dates: Date[] = [];
  const rangeStart = startOfDay(from);
  const rangeEnd = endOfDay(to);
  const start = startOfDay(startDate);
  const end = endDate ? endOfDay(endDate) : null;
  let cursor = start;
  while (!isAfter(cursor, rangeEnd)) {
    const y = getYear(cursor);
    const mo = getMonth(cursor);
    let d = new Date(y, mo, 1);
    if (dayOfMonth === -1) {
      d = lastDayOfMonth(d);
    } else {
      d = setDate(d, Math.min(dayOfMonth, getDate(lastDayOfMonth(d))));
    }
    if (
      !isBefore(d, rangeStart) &&
      !isAfter(d, rangeEnd) &&
      !isBefore(d, start) &&
      !(end && isAfter(d, end))
    ) {
      dates.push(startOfDay(d));
    }
    cursor = addMonths(cursor, 1);
  }
  return dates;
}

function filterItems<T extends { source: string; crmAccountId: string | null; installationId: string | null; sourceRefId: string | null }>(
  items: T[],
): T[] {
  const recurringKeys = new Set<string>();
  for (const it of items) {
    if (it.source === "RECURRING_DTE" && it.crmAccountId) {
      recurringKeys.add(`${it.crmAccountId}|${it.installationId ?? ""}`);
    }
  }
  return items.filter((i) => {
    if (i.source !== "CONTRACT" && !(i.source === "OTHER" && i.sourceRefId)) return true;
    if (!i.crmAccountId) return true;
    return !recurringKeys.has(`${i.crmAccountId}|${i.installationId ?? ""}`);
  });
}

type Reason =
  | "OK_EN_FC"
  | "PLANTILLA_INACTIVA"
  | "SIN_ESPEJO_FC"
  | "ESPEJO_INACTIVO_MONTO_CERO"
  | "DOM_DESFASADO"
  | "CONTRACT_TAPA"
  | "SIN_INSTALACION"
  | "FUERA_RANGO"
  | "DTE_MISMA_SEMANA"
  | "CUOTA_MOVIDA";

const MOTIVO: Record<Reason, string> = {
  OK_EN_FC: "Debería verse PROGRAMADA en esa semana",
  PLANTILLA_INACTIVA: "Plantilla inactiva",
  SIN_ESPEJO_FC: "Sin ítem RECURRING_DTE (abrir FC o guardar plantilla)",
  ESPEJO_INACTIVO_MONTO_CERO: "Espejo off o monto 0",
  DOM_DESFASADO: "Espejo con día distinto a plantilla",
  CONTRACT_TAPA: "CONTRACT CRM tapa recurrente (deploy viejo)",
  SIN_INSTALACION: "Sin installationId",
  FUERA_RANGO: "start/end no generan cuota en el mes",
  DTE_MISMA_SEMANA: "DTE en esa semana → ves factura, no PROGRAMADA",
  CUOTA_MOVIDA: "Cuota movida a otra semana en FC",
};

async function main() {
  const tenantSlug = process.argv.includes("--tenant")
    ? process.argv[process.argv.indexOf("--tenant") + 1]
    : "gard";
  const monthArg = process.argv.includes("--month")
    ? process.argv[process.argv.indexOf("--month") + 1]
    : null;
  const now = new Date();
  const year = monthArg ? Number(monthArg.slice(0, 4)) : now.getUTCFullYear();
  const month = monthArg ? Number(monthArg.slice(5, 7)) - 1 : now.getUTCMonth();

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant no encontrado");
    process.exit(1);
  }

  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const horizonFrom = new Date(Date.UTC(year, month - 1, 1));
  const horizonTo = new Date(Date.UTC(year, month + 2, 0));

  const [templates, mirrors, contracts, installations, accounts] = await Promise.all([
    prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.financeCashflowItem.findMany({
      where: { tenantId: tenant.id, source: "RECURRING_DTE" },
    }),
    prisma.financeCashflowItem.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        source: { in: ["CONTRACT", "OTHER"] },
      },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    }),
  ]);

  const instById = new Map(installations.map((i) => [i.id, i.name]));
  const accById = new Map(accounts.map((a) => [a.id, a.name]));
  const mirrorByTpl = new Map(
    mirrors.filter((m) => m.sourceRefId).map((m) => [m.sourceRefId!, m]),
  );
  const projected = filterItems([
    ...mirrors.filter((m) => m.isActive),
    ...contracts,
  ]);

  const rows: Array<{
    inst: string;
    cuenta: string;
    domTpl: string;
    domMirror: string;
    semana: string;
    sale: string;
    reasons: Reason[];
  }> = [];

  for (const tpl of templates) {
    const reasons: Reason[] = [];
    const inst = tpl.installationId
      ? (instById.get(tpl.installationId) ?? tpl.installationId)
      : "(sin instalación)";
    const cuenta =
      (tpl.crmAccountId && accById.get(tpl.crmAccountId)) ||
      tpl.receiverName;

    if (!tpl.isActive) reasons.push("PLANTILLA_INACTIVA");
    if (!tpl.installationId) reasons.push("SIN_INSTALACION");

    const mirror = mirrorByTpl.get(tpl.id);
    let semana = "—";
    let sale = "No";

    if (!mirror) {
      reasons.push("SIN_ESPEJO_FC");
    } else {
      if (!mirror.isActive) reasons.push("ESPEJO_INACTIVO_MONTO_CERO");
      if (
        tpl.dayOfMonth != null &&
        mirror.dayOfMonth != null &&
        tpl.dayOfMonth !== mirror.dayOfMonth
      ) {
        reasons.push("DOM_DESFASADO");
      }

      const contractHit = contracts.find(
        (c) =>
          c.isActive &&
          c.crmAccountId === tpl.crmAccountId &&
          (c.installationId ?? null) === (tpl.installationId ?? null),
      );
      const projects = projected.some((p) => p.id === mirror.id);
      if (contractHit && !projects) reasons.push("CONTRACT_TAPA");

      if (projects && mirror.dayOfMonth != null) {
        const dom = mirror.dayOfMonth;
        const dates = expandMonthlyDayOfMonth(
          dom,
          mirror.startDate,
          mirror.endDate,
          horizonFrom,
          horizonTo,
        );
        const inMonth = dates.filter(
          (d) => d >= monthStart && d <= monthEnd,
        );
        if (inMonth.length === 0) {
          reasons.push("FUERA_RANGO");
        } else {
          const target = inMonth[0];
          const bKey = bucketKeyFor(target);
          const bounds = bucketBoundsFor(target);
          semana = `${bounds.label} (${bounds.start.toISOString().slice(0, 10)}–${bounds.end.toISOString().slice(0, 10)})`;

          const dtes = await prisma.financeDte.findMany({
            where: {
              tenantId: tenant.id,
              direction: "ISSUED",
              crmAccountId: tpl.crmAccountId ?? undefined,
              installationId: tpl.installationId ?? undefined,
              date: { gte: bounds.start, lte: bounds.end },
              siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
            },
            select: { date: true },
          });
          if (dtes.some((d) => bucketKeyFor(d.date) === bKey)) {
            reasons.push("DTE_MISMA_SEMANA");
          }

          const mat = await prisma.financeCashflowOccurrence.findFirst({
            where: {
              tenantId: tenant.id,
              itemId: mirror.id,
              scheduledDate: { gte: monthStart, lte: monthEnd },
            },
            select: { scheduledDate: true },
          });
          if (mat && bucketKeyFor(mat.scheduledDate) !== bKey) {
            reasons.push("CUOTA_MOVIDA");
            semana += ` · mat=${bucketKeyFor(mat.scheduledDate)}`;
          }

          if (reasons.length === 0) {
            reasons.push("OK_EN_FC");
            sale = "Sí";
          } else if (
            reasons.length === 1 &&
            reasons[0] === "DTE_MISMA_SEMANA"
          ) {
            sale = "DTE (no prog.)";
          }
        }
      }
    }

    const domTpl =
      tpl.dayOfMonth === -1 ? "último" : String(tpl.dayOfMonth ?? "?");
    const domMir =
      mirror?.dayOfMonth === -1
        ? "último"
        : mirror
          ? String(mirror.dayOfMonth ?? "?")
          : "—";

    rows.push({
      inst,
      cuenta,
      domTpl,
      domMirror: domMir,
      semana,
      sale,
      reasons,
    });
  }

  console.log(`\n# ${tenant.name} — programación vs FC (${year}-${String(month + 1).padStart(2, "0")})\n`);

  const dom20 = rows.filter((r) => r.domTpl === "20");
  console.log(`## Día 20 (${dom20.length} plantillas)\n`);
  for (const r of dom20) {
    console.log(`### ${r.inst} (${r.cuenta})`);
    console.log(`- **Día programación:** ${r.domTpl} (plantilla) / ${r.domMirror} (espejo FC)`);
    console.log(`- **Semana ISO esperada (cuota jun):** ${r.semana}`);
    console.log(`- **¿Sale en FC?:** ${r.sale}`);
    console.log(`- **Por qué:** ${r.reasons.map((x) => MOTIVO[x]).join(" · ")}\n`);
  }

  const otros = rows.filter((r) => r.domTpl !== "20");
  console.log(`## Otros días (${otros.length} plantillas)\n`);
  for (const r of otros) {
    console.log(
      `- **${r.inst}** (${r.cuenta}) · día **${r.domTpl}** → ${r.semana} · FC: **${r.sale}** — ${r.reasons.map((x) => MOTIVO[x]).join(" · ")}`,
    );
  }

  console.log("\n## Resumen\n");
  const byReason = new Map<string, number>();
  for (const r of rows) {
    const key =
      r.reasons.includes("OK_EN_FC")
        ? "OK"
        : r.reasons.includes("DTE_MISMA_SEMANA")
          ? "DTE_misma_semana"
          : r.reasons[0] ?? "?";
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  for (const [k, v] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${k}: ${v}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
