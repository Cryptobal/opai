import "server-only";
import { buildFlowMatrix } from "./matrix.service";
import { addWeeksUTC, weekStartYmd, ymdToDate } from "./weeks";

function displayValue(section: string, layer: string, raw: number): number {
  if (section === "FINANCIAMIENTO" || section === "INGRESOS") {
    return layer === "real" && section === "INGRESOS" ? Math.abs(raw) : raw;
  }
  return Math.abs(raw);
}

/**
 * Contexto compacto de la matriz para el chat (sin IDs internos).
 * Acotado ~6k tokens: secciones, filas, montos por semana, estados, sellos.
 */
export async function buildFlowChatContext(tenantId: string): Promise<string> {
  const today = new Date();
  const fromMonday = weekStartYmd(today);
  const fromDate = ymdToDate(fromMonday)!;
  const toDate = addWeeksUTC(fromDate, 11);
  const m = await buildFlowMatrix(tenantId, {
    from: fromDate,
    to: toDate,
    granularity: "week",
  });

  const lines: string[] = [];
  lines.push(`Hoy: ${m.todayYmd}. Semana actual: ${m.currentWeek}.`);
  lines.push(`Saldo apertura banco: ${Math.round(m.openingBalance)} CLP.`);
  lines.push(`Umbral alerta: ${Math.round(m.warnThreshold)} CLP.`);
  lines.push(`KPIs: saldoHoy=${Math.round(m.kpis.saldoHoy)}, mín=${Math.round(m.kpis.minBalance)} (${m.kpis.minWeek}).`);
  if (m.closedWeeks.length) {
    lines.push(`Semanas selladas: ${m.closedWeeks.join(", ")}.`);
  }
  lines.push(`Columnas (lunes): ${m.columns.map((c) => `${c.label}=${c.weekStart}`).join(" | ")}`);
  lines.push(`Saldos proyectados: ${m.balances.map((b, i) => `${m.columns[i]?.label}:${Math.round(b)}`).join(" | ")}`);

  let chars = lines.join("\n").length;
  const MAX = 18_000;

  for (const section of ["INGRESOS", "REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS", "FINANCIAMIENTO"]) {
    const rows = m.rows.filter((r) => r.section === section);
    if (rows.length === 0) continue;
    lines.push(`\n## ${section}`);
    for (const row of rows) {
      if (chars > MAX) break;
      const cells = row.cells
        .map((c, i) => {
          const v = displayValue(row.section, c.layer, c.effective);
          if (v === 0 && c.layer === "empty") return null;
          const tag = c.layer === "real" ? "R" : c.layer === "committed" ? "C" : c.layer === "plan" ? "P" : "-";
          return `${m.columns[i]?.label ?? i}:${Math.round(v)}${tag}`;
        })
        .filter(Boolean)
        .join(", ");
      if (!cells) continue;
      const name = row.name.replace(/[\n|]/g, " ").slice(0, 60);
      const line = `- ${name}: ${cells}`;
      lines.push(line);
      chars += line.length + 1;
    }
  }

  if (m.rows.length === 0) {
    lines.push("(Sin movimientos aún en la planilla.)");
  }

  return lines.join("\n");
}
