/**
 * Renderer PURO (string → markdown de Slack) de la Ficha de Inicio. Sin I/O:
 * testeable sin Slack. El markdown de canvas soporta headers `#`, tablas
 * `| a | b |`, checkboxes `- [ ]`, links `[txt](url)`. Dentro de una celda de
 * tabla, `|` va escapado y los saltos son `<br>`.
 */

import { clp } from "../comercial/deal-common";
import { formatWeekdaysShort } from "@/lib/cpq/weekdays";
import type { StartCanvasData } from "./start-canvas-data";

/** Escapa un valor para meterlo en una celda de tabla markdown. */
function cell(s: string | null | undefined): string {
  return (s ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim() || "—";
}

/** Fecha larga es-CL en UTC (evita drift de zona con campos @db.Date). */
function longDate(d: Date): string {
  return d.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** dd-MM en UTC (getters UTC para no driftar con campos @db.Date). */
function shortDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}`;
}

/** Días entre hoy y `d`, ambos truncados a medianoche UTC. */
function dayDiff(d: Date, now: number): number {
  const dayMs = 86_400_000;
  const target = Math.floor(d.getTime() / dayMs);
  const today = Math.floor(now / dayMs);
  return target - today;
}

function countdown(serviceStartDate: Date, now: number): string {
  const diff = dayDiff(serviceStartDate, now);
  if (diff === 0) return "¡inicia hoy!";
  if (diff > 0) return `faltan ${diff} ${diff === 1 ? "día" : "días"}`;
  const n = Math.abs(diff);
  return `iniciado hace ${n} ${n === 1 ? "día" : "días"}`;
}

/**
 * Arma el markdown completo del canvas. `now` (ms epoch) inyectable para tests
 * deterministas; por defecto la hora actual.
 */
export function renderStartCanvasMarkdown(data: StartCanvasData, now: number = Date.now()): string {
  const lines: string[] = [];

  lines.push(`🏁 Inicio de servicio · ${data.accountName}`);
  lines.push("");
  lines.push(`📅 Inicia el **${longDate(data.serviceStartDate)}** · ${countdown(data.serviceStartDate, now)}`);
  // Modalidad de continuidad del servicio.
  if (data.isOngoingService) {
    lines.push("🔁 Servicio continuo (indefinido)");
  } else {
    const meses = data.contractDurationMonths ?? 0;
    const termina = data.serviceEndDate ? ` · termina el **${longDate(data.serviceEndDate)}**` : "";
    lines.push(`⏳ Plazo definido · ${meses} ${meses === 1 ? "mes" : "meses"}${termina}`);
  }
  lines.push("");

  // ── Condiciones del servicio ──
  lines.push("## 📋 Condiciones del servicio");
  const rows: Array<[string, string]> = [];
  rows.push(["Dotación", `**${data.totalGuards} ${data.totalGuards === 1 ? "guardia" : "guardias"}** · ${data.positions.length} ${data.positions.length === 1 ? "puesto" : "puestos"}`]);
  if (data.positions.length) {
    const horarios = data.positions
      .map((p, i) => `P${i + 1}: ${formatWeekdaysShort(p.weekdays)} ${p.startTime || "—"}–${p.endTime || "—"} (${p.numGuards})`)
      .join("<br>");
    rows.push(["Horarios", cell(horarios)]);
  }
  for (const cs of data.cargoSueldo) {
    const liquido = cs.netSalary != null ? `**${clp(cs.netSalary)} líquido** ` : "";
    rows.push(["Cargo / Sueldo", `${cell(cs.cargo)} · ${liquido}(base ${clp(cs.baseSalary)})`]);
  }
  if (data.addressText || data.mapsUrl) {
    const dir = data.addressText ? cell(data.addressText) : "—";
    rows.push(["Dirección", data.mapsUrl ? `${dir} → [📍 Cómo llegar](${data.mapsUrl})` : dir]);
  }
  rows.push(["Monto mensual", data.amount ? `**${clp(data.amount)} + IVA**` : "—"]);
  if (data.isOngoingService) {
    rows.push(["Modalidad", "Servicio continuo"]);
  } else {
    rows.push(["Modalidad", `Plazo definido (${data.contractDurationMonths ?? 0} ${data.contractDurationMonths === 1 ? "mes" : "meses"})`]);
    if (data.serviceEndDate) rows.push(["Término estimado", longDate(data.serviceEndDate)]);
  }
  if (data.quoteLabel) rows.push(["Cotización", data.quoteUrl ? `[${cell(data.quoteLabel)}](${data.quoteUrl})` : cell(data.quoteLabel)]);
  if (data.contact) {
    const c = [data.contact.name, data.contact.phone, data.contact.email].filter(Boolean).join(" · ");
    if (c) rows.push(["Contacto", cell(c)]);
  }
  if (data.extras) rows.push(["Extras", cell(data.extras)]);
  for (const [k, v] of rows) lines.push(`| ${k} | ${v} |`);
  lines.push("");

  // ── Checklist de inicio ──
  lines.push("## ✅ Checklist de inicio");
  const sorted = [...data.steps].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  if (!sorted.length) lines.push("_Sin pasos configurados._");
  for (const s of sorted) {
    const extra = s.isExtra ? "  ·  ⭐ EXTRA" : "";
    lines.push(`- [ ] ${s.title} — @${s.team} · vence ${shortDate(s.dueDate)}${extra}`);
  }
  lines.push("");

  // ── Documentos del negocio ──
  lines.push("## 📎 Documentos del negocio");
  if (!data.files.length) lines.push("_Sin documentos vinculados aún._");
  for (const f of data.files) lines.push(`- [${f.fileName.replace(/\]/g, "\\]")}](${f.downloadUrl})`);
  lines.push("");

  // ── Enlaces ──
  lines.push("## 🔗 Enlaces");
  lines.push(`- [🟣 Abrir negocio en OPAI](${data.opaiDealUrl})`);
  if (data.quoteUrl) lines.push(`- [📄 Cotización](${data.quoteUrl})`);
  lines.push(`- [🏢 Cuenta](${data.accountUrl})`);
  lines.push("");

  lines.push("_Generado por OPAI al adjudicar · condiciones desde la cotización · marca cada ítem aquí ✔_");

  return lines.join("\n");
}
