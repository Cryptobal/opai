/**
 * Renderiza un informe VRA completo a HTML para preview o export PDF.
 * El diseño está calibrado al estándar Gard Security (navy + gold).
 */

import type { VraSectionContent } from "./types";

type RenderableReport = {
  id: string;
  title: string;
  riskLevel: string | null;
  version: number;
  generatedAt: Date | null;
  metadata: Record<string, unknown> | null;
  installation: { name: string; address: string | null; city: string | null };
  sections: Array<{
    id: string;
    key: string;
    title: string;
    outputType: string;
    sortOrder: number;
    contentJson: unknown;
    status: string;
  }>;
};

const ANNEX_TYPES = new Set(["photo_gallery", "norms_table", "glossary"]);

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function severityColor(s: string | undefined): string {
  switch (String(s).toLowerCase()) {
    case "critical": return "#B91C1C";
    case "high": return "#C2410C";
    case "medium": return "#A16207";
    case "low": return "#15803D";
    default: return "#64748B";
  }
}

function severityLabel(s: string | undefined): string {
  switch (String(s).toLowerCase()) {
    case "critical": return "CRÍTICO";
    case "high": return "ALTO";
    case "medium": return "MEDIO";
    case "low": return "BAJO";
    default: return String(s ?? "—").toUpperCase();
  }
}

function computeNumbering(
  sections: RenderableReport["sections"],
): Map<string, string> {
  const result = new Map<string, string>();
  let mainCount = 0;
  let annexCount = 0;
  const sorted = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of sorted) {
    if (ANNEX_TYPES.has(s.outputType)) {
      annexCount++;
      result.set(s.id, String.fromCharCode(64 + annexCount));
    } else {
      mainCount++;
      result.set(s.id, String(mainCount));
    }
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// RENDERERS POR TIPO DE BLOQUE
// ────────────────────────────────────────────────────────────────────────────

function renderNarrative(c: VraSectionContent): string {
  if (!c.narrative) return "";
  const paragraphs = c.narrative.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join("");
  return `<div class="narrative">${paragraphs}</div>`;
}

function renderBullets(c: VraSectionContent): string {
  if (!c.bullets || c.bullets.length === 0) return "";
  const items = c.bullets.map((b) => `<li>${esc(b)}</li>`).join("");
  return `<ul class="bullets">${items}</ul>`;
}

function renderTable(c: VraSectionContent): string {
  if (!c.table) return "";
  const head = `<tr>${c.table.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
  const rows = c.table.rows
    .map((r) => {
      const cells = r.map((cell) => {
        if (typeof cell === "string") return `<td>${esc(cell)}</td>`;
        const sev = cell.severity;
        return `<td style="color:${severityColor(sev)};font-weight:600">${esc(cell.value)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table class="data-table"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function renderRiskDistribution(c: VraSectionContent): string {
  const meta = c.metadata ?? {};
  const counts = {
    critical: parseInt(meta.criticalCount ?? "0", 10),
    high: parseInt(meta.highCount ?? "0", 10),
    medium: parseInt(meta.mediumCount ?? "0", 10),
    low: parseInt(meta.lowCount ?? "0", 10),
  };
  return `
    ${renderNarrative(c)}
    <div class="subsection-title">Hallazgos Críticos</div>
    ${renderBullets(c)}
    <div class="subsection-title">Distribución del Riesgo Identificado</div>
    <div class="risk-cards">
      <div class="risk-card" style="background:#B91C1C"><div class="risk-num">${counts.critical}</div><div class="risk-label">CRÍTICO</div></div>
      <div class="risk-card" style="background:#C2410C"><div class="risk-num">${counts.high}</div><div class="risk-label">ALTO</div></div>
      <div class="risk-card" style="background:#A16207"><div class="risk-num">${counts.medium}</div><div class="risk-label">MEDIO</div></div>
      <div class="risk-card" style="background:#15803D"><div class="risk-num">${counts.low}</div><div class="risk-label">BAJO</div></div>
    </div>
  `;
}

function renderVulnCards(c: VraSectionContent): string {
  if (!c.vulnerabilities || c.vulnerabilities.length === 0) {
    return `<p class="empty">No se identificaron vulnerabilidades.</p>`;
  }
  return c.vulnerabilities
    .map((v) => {
      const color = severityColor(v.finalRisk);
      const sysList = (v.affectedSystems ?? []).join(", ");
      return `
        <div class="vuln-card" style="border-color:${color}">
          <div class="vuln-header">
            <span class="vuln-code" style="color:${color}">${esc(v.code)}</span>
            <span class="vuln-title">${esc(v.title)}</span>
          </div>
          <div class="vuln-badge" style="background:${color}">${severityLabel(v.finalRisk)}</div>
          <span class="vuln-badge-note"> · Riesgo evaluado</span>
          <p class="vuln-desc">${esc(v.description)}</p>
          <ul class="vuln-attrs">
            <li><strong>Probabilidad:</strong> ${esc(v.probability)}</li>
            <li><strong>Impacto:</strong> ${esc(v.impact)}</li>
            <li><strong>Factores agravantes:</strong> ${esc(v.aggravatingFactors)}</li>
            <li><strong>Sistemas afectados:</strong> ${esc(sysList)}</li>
          </ul>
        </div>
      `;
    })
    .join("");
}

function renderRiskMatrix(c: VraSectionContent): string {
  if (!c.vulnerabilities || c.vulnerabilities.length === 0) {
    return `<p class="empty">Matriz no disponible — sin vulnerabilidades.</p>`;
  }
  const rows = c.vulnerabilities
    .map((v) => {
      const color = severityColor(v.finalRisk);
      return `
        <tr>
          <td><span class="badge-code">${esc(v.code)}</span></td>
          <td>${esc(v.title)}</td>
          <td>${esc(v.sectorOrSystem ?? "")}</td>
          <td>${esc(v.probability)}</td>
          <td>${esc(v.impact)}</td>
          <td><span class="badge-risk" style="background:${color}">${severityLabel(v.finalRisk)}</span></td>
        </tr>
      `;
    })
    .join("");
  return `
    <table class="data-table risk-matrix">
      <thead>
        <tr><th>ID</th><th>Vulnerabilidad</th><th>Sector / Sistema</th><th>Probabilidad</th><th>Impacto</th><th>Riesgo</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderHeatMap(c: VraSectionContent): string {
  if (!c.heatMap || c.heatMap.length === 0) return "";
  const probabilities = ["Casi Cierto", "Probable", "Posible", "Improbable"];
  const impacts = ["Insignificante", "Menor", "Moderado", "Mayor"];

  const cellAt = (p: string, i: string): string => {
    const cell = c.heatMap!.find((x) => x.probability === p && x.impact === i);
    return cell?.vulnerabilityCodes?.join(" · ") ?? "";
  };

  const cellColor = (p: string, i: string): string => {
    const pIdx = probabilities.indexOf(p);
    const iIdx = impacts.indexOf(i);
    const score = (3 - pIdx) + iIdx;
    if (score >= 5) return "#FEE2E2";
    if (score >= 4) return "#FED7AA";
    if (score >= 2) return "#FEF3C7";
    return "#D1FAE5";
  };

  return `
    <table class="heat-map">
      <thead>
        <tr>
          <th class="hm-corner"></th>
          <th colspan="4" class="hm-axis">IMPACTO →</th>
        </tr>
        <tr>
          <th></th>
          ${impacts.map((i) => `<th class="hm-impact-label">${esc(i)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${probabilities
          .map(
            (p) => `<tr>
            <td class="hm-prob-label">${esc(p)}</td>
            ${impacts.map((i) => `<td class="hm-cell" style="background:${cellColor(p, i)}">${esc(cellAt(p, i))}</td>`).join("")}
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <div class="hm-axis-bottom">↑ Probabilidad &nbsp;/&nbsp; Impacto →</div>
  `;
}

function renderRecommendations(c: VraSectionContent): string {
  if (!c.recommendations || c.recommendations.length === 0) return "";
  const priorityColor = (p: string): string => {
    switch (p) {
      case "Inmediata": return "#B91C1C";
      case "Alta": return "#C2410C";
      case "Media": return "#A16207";
      case "Baja": return "#15803D";
      default: return "#64748B";
    }
  };

  return c.recommendations
    .map((r) => {
      const color = priorityColor(r.priority);
      return `
        <div class="rec-card" style="border-color:${color}">
          <div class="rec-header">
            <span class="rec-code" style="color:${color}">${esc(r.code)}</span>
            <span class="rec-title">${esc(r.title)}</span>
          </div>
          <div class="rec-meta">
            <span class="rec-badge" style="background:${color}">${esc(r.priority).toUpperCase()}</span>
            <span class="rec-meta-text">${esc(r.priority)} (${r.termDays.from}-${r.termDays.to} días)</span>
            <span class="rec-meta-sep"> · </span>
            <span class="rec-meta-text">Plazo: <strong>${r.termDays.from}-${r.termDays.to} días</strong></span>
            <span class="rec-meta-sep"> · </span>
            <span class="rec-meta-text">Inversión: <strong>${esc(r.investmentLevel)}${r.investmentNote ? ` (${esc(r.investmentNote)})` : ""}</strong></span>
          </div>
          <div class="rec-block">
            <div class="rec-label">Acción</div>
            <p>${esc(r.action)}</p>
          </div>
          <div class="rec-block">
            <div class="rec-label">Justificación</div>
            <p>${esc(r.justification)}</p>
          </div>
          <div class="rec-block">
            <div class="rec-label">Indicador de éxito (KPI)</div>
            <p><em>${esc(r.kpi)}</em></p>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRoadmap(c: VraSectionContent): string {
  if (!c.roadmap || c.roadmap.length === 0) return "";
  const phaseColor = (n: number): string =>
    [null, "#B91C1C", "#C2410C", "#A16207", "#15803D"][n] ?? "#64748B";

  const rows = c.roadmap
    .map((p) => {
      const color = phaseColor(p.phase);
      const items = p.items
        .map((i) => `<li><strong>${esc(i.code)}</strong> · ${esc(i.description)}</li>`)
        .join("");
      return `
        <tr>
          <td class="roadmap-phase" style="background:${color}">
            <div class="phase-num">FASE ${p.phase}</div>
            <div class="phase-term">${p.termDays.from}–${p.termDays.to === 9999 ? "+" : p.termDays.to} días</div>
          </td>
          <td class="roadmap-items">
            <div class="phase-title">${esc(p.title)}</div>
            <ul>${items}</ul>
          </td>
        </tr>
      `;
    })
    .join("");
  return `<table class="roadmap-table"><thead><tr><th>Fase / Plazo</th><th>Acciones priorizadas</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPhotoGallery(c: VraSectionContent): string {
  if (!c.photoGallery || c.photoGallery.length === 0) return "";
  return c.photoGallery
    .map((p) => {
      const color = severityColor(p.severity);
      return `
        <div class="photo-card">
          <div class="photo-img"><img src="${esc(p.publicUrl)}" alt="${esc(p.title)}"/></div>
          <div class="photo-text">
            <div class="photo-meta">
              <span class="photo-code">FOTO ${esc(p.code)}</span>
              <span class="photo-sep"> · </span>
              <span class="photo-badge" style="background:${color}">${severityLabel(p.severity)}</span>
            </div>
            <div class="photo-title">${esc(p.title)}</div>
            <p class="photo-obs">${esc(p.technicalObservation)}</p>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderCustomBlocks(c: VraSectionContent): string {
  if (!c.customBlocks || c.customBlocks.length === 0)
    return renderNarrative(c) + renderBullets(c) + renderTable(c);
  return c.customBlocks
    .map((b) => {
      const block = b as { type?: string; title?: string; table?: VraSectionContent["table"]; narrative?: string };
      if (block.type === "section") {
        return `
          <div class="subsection">
            ${block.title ? `<h3 class="subsection-h3">${esc(block.title)}</h3>` : ""}
            ${block.narrative ? renderNarrative({ narrative: block.narrative }) : ""}
            ${block.table ? renderTable({ table: block.table }) : ""}
          </div>
        `;
      }
      return "";
    })
    .join("");
}

function renderSectionContent(s: RenderableReport["sections"][number]): string {
  if (s.status === "error" || !s.contentJson) {
    return `<div class="section-error">⚠️ Esta sección no se pudo generar.</div>`;
  }
  const c = s.contentJson as VraSectionContent;
  switch (s.outputType) {
    case "narrative": return renderNarrative(c);
    case "bulleted_list": return renderBullets(c);
    case "comparison_table": return renderTable(c);
    case "site_description": return renderNarrative(c) + renderTable(c);
    case "risk_distribution": return renderRiskDistribution(c);
    case "vuln_cards": return renderNarrative(c) + renderVulnCards(c);
    case "risk_matrix": return renderNarrative(c) + renderRiskMatrix(c) + renderHeatMap(c);
    case "heat_map": return renderHeatMap(c);
    case "recommendations": return renderNarrative(c) + renderRecommendations(c);
    case "roadmap": return renderNarrative(c) + renderRoadmap(c);
    case "photo_gallery": return renderNarrative(c) + renderPhotoGallery(c);
    case "norms_table": return renderCustomBlocks(c);
    case "glossary": return renderTable(c);
    case "metadata_card": {
      const headers = ["Campo", "Valor"];
      const rows = Object.entries(c.metadata ?? {}).map(
        ([k, v]) => [k, String(v)] as (string | { value: string; severity?: import("./types").VraSeverity })[],
      );
      return renderTable({ table: { headers, rows } });
    }
    default: return renderNarrative(c) + renderBullets(c) + renderTable(c);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HTML COMPLETO
// ────────────────────────────────────────────────────────────────────────────

export function renderVraReportHtml(
  report: RenderableReport,
  brand: { color: string; goldAccent: string; companyName: string },
): string {
  const numbering = computeNumbering(report.sections);
  const generatedAtStr = report.generatedAt
    ? new Date(report.generatedAt).toLocaleDateString("es-CL", { year: "numeric", month: "long" })
    : "—";
  const riskColor = severityColor(report.riskLevel ?? "medium");
  const riskLabel = severityLabel(report.riskLevel ?? "medium");

  const tocItems = report.sections
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => {
      const num = numbering.get(s.id) ?? "";
      return `<li><span class="toc-num">${esc(num)}.</span> <span class="toc-title">${esc(s.title)}</span></li>`;
    })
    .join("");

  const sectionsHtml = report.sections
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => {
      const num = numbering.get(s.id) ?? "";
      const isAnnex = ANNEX_TYPES.has(s.outputType);
      return `
        <section class="report-section ${isAnnex ? "is-annex" : ""}">
          <div class="section-banner">
            <span class="section-num">${esc(num)}.</span>
            <span class="section-title">${esc(s.title.toUpperCase())}</span>
          </div>
          <div class="section-content">
            ${renderSectionContent(s)}
          </div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${esc(report.title)}</title>
<style>
  @page { size: Letter; margin: 18mm 14mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Calibri', 'Helvetica', Arial, sans-serif; color:#1F2937; font-size:11pt; line-height:1.55; }
  h1, h2, h3 { color: ${brand.color}; }

  /* ─ Cover ─ */
  .cover { padding: 12mm 0 0; min-height: 90vh; display:flex; flex-direction:column; }
  .cover-header { display:flex; justify-content:space-between; align-items:start; margin-bottom: 16mm; }
  .cover-eyebrow { font-size: 9pt; letter-spacing: 0.18em; color:#64748B; text-transform:uppercase; }
  .cover-eyebrow strong { color: ${brand.color}; }
  .cover-title { font-size: 28pt; line-height:1.05; color: ${brand.color}; font-weight: 700; margin: 6mm 0 4mm; border-top: 2px solid ${brand.goldAccent}; padding-top: 4mm; max-width: 70%; }
  .cover-subtitle { font-size: 13pt; color:#64748B; font-style: italic; margin-bottom: 12mm; }
  .cover-client { background: #F8FAFC; padding: 6mm; border-left: 4px solid ${brand.color}; margin-bottom: 8mm; max-width: 80%; }
  .cover-client-label { font-size: 9pt; letter-spacing: 0.16em; text-transform: uppercase; color:#64748B; margin-bottom: 2mm; }
  .cover-client-name { font-size: 18pt; font-weight: 700; color: ${brand.color}; }
  .cover-client-details { font-size: 10pt; color:#475569; margin-top: 2mm; }
  .cover-meta-table { width:100%; border-collapse: collapse; margin-top: auto; }
  .cover-meta-table th, .cover-meta-table td { padding: 4mm 5mm; text-align: center; font-size: 9pt; }
  .cover-meta-table th { background: ${brand.color}; color: #fff; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 600; }
  .cover-meta-table td { background: #F8FAFC; font-weight: 700; }
  .cover-meta-table td.risk-cell { color: #fff; }
  .cover-footer { margin-top: 6mm; padding-top: 4mm; border-top: 1px solid #E2E8F0; font-size: 8pt; color: #94A3B8; text-align: center; letter-spacing: 0.1em; }

  /* ─ Section banner ─ */
  .report-section { page-break-before: always; }
  .report-section:first-of-type { page-break-before: auto; }
  .section-banner { background: ${brand.color}; color: #fff; padding: 4mm 5mm; margin: 6mm 0 5mm; border-left: 4px solid ${brand.goldAccent}; }
  .section-num { font-size: 13pt; font-weight: 700; margin-right: 3mm; }
  .section-title { font-size: 13pt; font-weight: 700; letter-spacing: 0.04em; }

  /* ─ TOC ─ */
  .toc { padding: 6mm 0; }
  .toc-list { list-style: none; padding: 0; }
  .toc-list li { padding: 2mm 0; border-bottom: 1px dotted #CBD5E1; display: flex; }
  .toc-num { font-weight: 700; color: ${brand.color}; min-width: 18mm; }
  .toc-title { flex: 1; }

  /* ─ Narrative ─ */
  .narrative p { margin: 0 0 3mm; text-align: justify; }
  .subsection-title { font-size: 11pt; font-weight: 700; color: ${brand.color}; margin: 4mm 0 2mm; }
  .subsection-h3 { font-size: 12pt; font-weight: 700; color: ${brand.color}; margin: 5mm 0 3mm; }

  /* ─ Bullets ─ */
  .bullets { padding-left: 6mm; margin: 2mm 0 4mm; }
  .bullets li { margin: 1.5mm 0; }
  .bullets li::marker { color: ${brand.color}; }

  /* ─ Tables ─ */
  .data-table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 10pt; }
  .data-table th { background: ${brand.color}; color: #fff; padding: 3mm 4mm; text-align: left; font-weight: 600; font-size: 9pt; letter-spacing: 0.04em; }
  .data-table td { padding: 3mm 4mm; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
  .data-table tr:nth-child(even) td { background: #F8FAFC; }
  .badge-code { background: #EAF1F9; color: ${brand.color}; padding: 1mm 2mm; border-radius: 2mm; font-weight: 700; font-family: monospace; font-size: 9pt; }
  .badge-risk { color: #fff; padding: 1mm 3mm; border-radius: 2mm; font-weight: 700; font-size: 9pt; letter-spacing: 0.04em; }

  /* ─ Risk distribution cards ─ */
  .risk-cards { display: flex; gap: 2mm; margin: 3mm 0 5mm; }
  .risk-card { flex:1; color: #fff; padding: 5mm 3mm; text-align: center; border-radius: 2mm; }
  .risk-num { font-size: 24pt; font-weight: 700; line-height: 1; }
  .risk-label { font-size: 9pt; letter-spacing: 0.12em; margin-top: 2mm; font-weight: 600; }

  /* ─ Vuln cards ─ */
  .vuln-card { border: 2px solid #B91C1C; border-radius: 3mm; padding: 4mm 5mm; margin: 4mm 0; page-break-inside: avoid; }
  .vuln-header { margin-bottom: 2mm; }
  .vuln-code { font-family: monospace; font-weight: 700; font-size: 10pt; margin-right: 3mm; }
  .vuln-title { font-weight: 700; font-size: 12pt; color: ${brand.color}; }
  .vuln-badge { display: inline-block; color: #fff; padding: 0.5mm 2mm; border-radius: 1.5mm; font-size: 9pt; font-weight: 700; letter-spacing: 0.05em; }
  .vuln-badge-note { font-size: 9pt; color: #94A3B8; }
  .vuln-desc { margin: 3mm 0; text-align: justify; }
  .vuln-attrs { padding-left: 5mm; margin-top: 2mm; }
  .vuln-attrs li { margin: 1mm 0; }

  /* ─ Heat map ─ */
  .heat-map { width: 100%; border-collapse: collapse; margin: 4mm 0; font-size: 9pt; }
  .heat-map th, .heat-map td { padding: 4mm 2mm; text-align: center; }
  .hm-corner { background: transparent; border: none; }
  .hm-axis { background: ${brand.color}; color: #fff; font-weight: 700; letter-spacing: 0.1em; }
  .hm-impact-label, .hm-prob-label { background: #1E293B; color: #fff; font-weight: 600; }
  .hm-cell { font-weight: 700; color: ${brand.color}; min-height: 16mm; }
  .hm-axis-bottom { text-align: center; font-size: 9pt; color: #64748B; font-style: italic; margin-top: 2mm; }

  /* ─ Recommendation cards ─ */
  .rec-card { border: 1px solid #E2E8F0; border-left: 4px solid #B91C1C; border-radius: 2mm; padding: 4mm 5mm; margin: 4mm 0; page-break-inside: avoid; }
  .rec-code { font-family: monospace; font-weight: 700; margin-right: 3mm; font-size: 10pt; }
  .rec-title { font-weight: 700; font-size: 12pt; color: ${brand.color}; }
  .rec-badge { display: inline-block; color: #fff; padding: 1mm 2.5mm; border-radius: 1.5mm; font-weight: 700; font-size: 8pt; letter-spacing: 0.06em; }
  .rec-meta-text { font-size: 9pt; color: #475569; }
  .rec-meta-sep { color: #CBD5E1; }
  .rec-meta { margin: 2mm 0 3mm; }
  .rec-block { margin: 2.5mm 0; }
  .rec-label { font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; color: #64748B; font-weight: 700; margin-bottom: 1mm; }
  .rec-block p { font-size: 10pt; }

  /* ─ Roadmap ─ */
  .roadmap-table { width: 100%; border-collapse: collapse; margin: 4mm 0; }
  .roadmap-table th { background: ${brand.color}; color: #fff; padding: 3mm; text-align: left; }
  .roadmap-phase { color: #fff; padding: 5mm 4mm; text-align: center; vertical-align: middle; min-width: 30mm; }
  .phase-num { font-size: 11pt; font-weight: 700; letter-spacing: 0.06em; }
  .phase-term { font-size: 9pt; opacity: 0.9; margin-top: 1mm; }
  .roadmap-items { padding: 4mm 5mm; vertical-align: top; }
  .phase-title { font-weight: 700; color: ${brand.color}; margin-bottom: 2mm; }
  .roadmap-items ul { padding-left: 5mm; }
  .roadmap-items li { margin: 1mm 0; font-size: 10pt; }

  /* ─ Photo gallery ─ */
  .photo-card { display: flex; gap: 4mm; margin: 5mm 0; page-break-inside: avoid; border-left: 3px solid ${brand.color}; padding-left: 4mm; }
  .photo-img { width: 70mm; flex-shrink: 0; }
  .photo-img img { width: 100%; height: auto; border-radius: 1mm; display: block; }
  .photo-text { flex: 1; }
  .photo-meta { font-size: 8pt; letter-spacing: 0.06em; margin-bottom: 2mm; }
  .photo-code { color: #64748B; font-weight: 600; }
  .photo-sep { color: #CBD5E1; }
  .photo-badge { color: #fff; padding: 0.5mm 2mm; border-radius: 1mm; font-weight: 700; font-size: 8pt; }
  .photo-title { font-weight: 700; color: ${brand.color}; margin-bottom: 2mm; }
  .photo-obs { font-size: 9.5pt; color: #475569; }

  /* ─ Sub-sections ─ */
  .subsection { margin: 4mm 0 6mm; }

  /* ─ Annex header ─ */
  .is-annex .section-banner::before { content: "ANEXO "; }

  /* ─ Empty states ─ */
  .empty { color: #94A3B8; font-style: italic; padding: 4mm; text-align: center; }
  .section-error { color: #B91C1C; padding: 4mm; background: #FEE2E2; border-radius: 1mm; }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-header">
    <div class="cover-eyebrow"><strong>${esc(brand.companyName.toUpperCase())}</strong> · DEPARTAMENTO DE OPERACIONES</div>
  </div>
  <h1 class="cover-title">Informe de Evaluación<br/>de Vulnerabilidades</h1>
  <div class="cover-subtitle">Análisis integral de amenazas, riesgos y recomendaciones de seguridad física, electrónica y operacional.</div>
  <div class="cover-client">
    <div class="cover-client-label">Cliente</div>
    <div class="cover-client-name">${esc(report.installation.name)}</div>
    <div class="cover-client-details">${esc([report.installation.address, report.installation.city].filter(Boolean).join(" · "))}</div>
  </div>
  <table class="cover-meta-table">
    <tr><th>Clasificación</th><th>Versión</th><th>Fecha</th><th>Nivel de Riesgo</th></tr>
    <tr>
      <td>CONFIDENCIAL</td>
      <td>${report.version}.0</td>
      <td>${esc(generatedAtStr)}</td>
      <td class="risk-cell" style="background:${riskColor}">${esc(riskLabel)}</td>
    </tr>
  </table>
  <div class="cover-footer">DOCUMENTO CONFIDENCIAL · USO RESTRINGIDO CLIENTE / ${esc(brand.companyName.toUpperCase())} · PROHIBIDA SU DIVULGACIÓN SIN AUTORIZACIÓN ESCRITA</div>
</div>

<!-- TOC -->
<section class="report-section">
  <div class="section-banner"><span class="section-title">TABLA DE CONTENIDOS</span></div>
  <ul class="toc-list">
    ${tocItems}
  </ul>
</section>

<!-- SECTIONS -->
${sectionsHtml}

</body>
</html>`;
}
