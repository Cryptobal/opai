import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import { prisma } from "@/lib/prisma";

type ControlNocturnoPdfReporte = {
  id: string;
  date: Date;
  centralOperatorName: string;
  centralLabel: string | null;
  shiftStart: string;
  shiftEnd: string;
  generalNotes: string | null;
  instalaciones: Array<{
    id: string;
    installationName: string;
    guardiasRequeridos: number;
    guardiasPresentes: number;
    horaLlegadaTurnoDia: string | null;
    guardiaDiaNombres: string | null;
    statusInstalacion: string;
    notes: string | null;
    guardias: Array<{
      id: string;
      guardiaNombre: string;
      isExtra: boolean;
      horaLlegada: string | null;
    }>;
    rondas: Array<{
      id: string;
      rondaNumber: number;
      horaEsperada: string;
      horaMarcada: string | null;
      status: string;
      notes: string | null;
    }>;
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  completada: "✓",
  omitida: "✗",
  pendiente: "—",
  no_aplica: "N/A",
};

const STATUS_BG: Record<string, string> = {
  completada: "#059669",
  omitida: "#dc2626",
  pendiente: "#71717a",
  no_aplica: "#a1a1aa",
};

const INST_STATUS_BG: Record<string, string> = {
  normal: "#059669",
  novedad: "#d97706",
  critico: "#dc2626",
  no_aplica: "#71717a",
};

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseRelevoDiaForPdf(
  guardiaDiaNombres: string | null,
  horaLlegadaTurnoDia: string | null,
): { nombres: string; horas: string } {
  if (!guardiaDiaNombres?.trim()) {
    return { nombres: "—", horas: escapeHtml(horaLlegadaTurnoDia) || "—" };
  }
  const s = guardiaDiaNombres.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as Array<{
        nombre?: string;
        hora?: string | null;
        isExtra?: boolean;
      }>;
      if (Array.isArray(arr) && arr.length > 0) {
        const nombres = arr
          .map((x) => {
            const n = escapeHtml(typeof x.nombre === "string" ? x.nombre : "");
            return x.isExtra
              ? `${n} <span style="color:#d97706;font-size:9px;font-weight:600">EXTRA</span>`
              : n;
          })
          .join("<br/>");
        const horas = arr
          .map((x) => escapeHtml(typeof x.hora === "string" ? x.hora : "") || "—")
          .join("<br/>");
        return { nombres: nombres || "—", horas: horas || "—" };
      }
    } catch {
      // fallback
    }
  }
  return {
    nombres: escapeHtml(s),
    horas: escapeHtml(horaLlegadaTurnoDia) || "—",
  };
}

export function buildControlNocturnoPdfHtml(reporte: ControlNocturnoPdfReporte): string {
  const dateFormatted = new Date(
    reporte.date.toISOString().slice(0, 10) + "T12:00:00",
  ).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const instRows = reporte.instalaciones
    .map((inst, idx) => {
      const guardiaNames = inst.guardias
        .map(
          (g) =>
            `${escapeHtml(g.guardiaNombre)}${
              g.isExtra
                ? ' <span style="color:#d97706;font-size:9px;font-weight:600">EXTRA</span>'
                : ""
            }`,
        )
        .join("<br/>");
      const horaLlegada = inst.guardias.map((g) => g.horaLlegada || "—").join("<br/>");

      const rondaCells = inst.rondas
        .map((r) => {
          const bg = STATUS_BG[r.status] || STATUS_BG.pendiente;
          const label =
            r.status === "completada" && r.horaMarcada
              ? r.horaMarcada
              : STATUS_LABEL[r.status] || "—";
          const hasNote = r.notes
            ? `<div style="font-size:7px;color:#a5b4fc;margin-top:1px">💬</div>`
            : "";
          return `<td style="text-align:center;font-size:9px;padding:2px 3px;background:${bg}20;color:${bg};font-weight:600;border:1px solid #333">${label}${hasNote}</td>`;
        })
        .join("");

      const instBg = INST_STATUS_BG[inst.statusInstalacion] || INST_STATUS_BG.normal;
      const relevoDia = parseRelevoDiaForPdf(
        inst.guardiaDiaNombres,
        inst.horaLlegadaTurnoDia,
      );

      const hasInstNotes = inst.notes;
      const roundsWithNotes = inst.rondas.filter((r) => r.notes);
      const hasAnyNotes = hasInstNotes || roundsWithNotes.length > 0;
      const notesIndicator = hasAnyNotes
        ? `<div style="font-size:8px;color:#a5b4fc;margin-top:2px">📝 Ver notas abajo</div>`
        : "";

      return `<tr>
          <td style="text-align:center;padding:4px;border:1px solid #333;font-size:10px;font-weight:600">${idx + 1}</td>
          <td style="padding:4px;border:1px solid #333;font-size:10px;max-width:100px">
            ${escapeHtml(inst.installationName)}
            <span style="display:inline-block;margin-left:4px;background:${instBg}20;color:${instBg};font-size:8px;padding:1px 4px;border-radius:6px;font-weight:600">${inst.guardiasPresentes}/${inst.guardiasRequeridos}</span>
            ${notesIndicator}
          </td>
          <td style="padding:4px;border:1px solid #333;font-size:9px">${guardiaNames || "—"}</td>
          <td style="text-align:center;padding:4px;border:1px solid #333;font-size:9px">${horaLlegada}</td>
          ${rondaCells}
          <td style="text-align:center;padding:4px;border:1px solid #333;font-size:9px">${relevoDia.horas}</td>
          <td style="padding:4px;border:1px solid #333;font-size:9px">${relevoDia.nombres}</td>
        </tr>`;
    })
    .join("");

  const notesEntries = reporte.instalaciones
    .map((inst, idx) => {
      const parts: string[] = [];

      if (inst.notes) {
        parts.push(
          `<div style="margin-bottom:2px"><span style="color:#a5b4fc;font-weight:600">Nota:</span> ${escapeHtml(inst.notes)}</div>`,
        );
      }

      const roundNotes = inst.rondas.filter((r) => r.notes);
      for (const r of roundNotes) {
        const rLabel = r.status === "completada" ? "✓" : r.status === "omitida" ? "✗" : "—";
        parts.push(
          `<div style="margin-bottom:2px"><span style="color:#94a3b8">R${r.rondaNumber} (${r.horaEsperada.slice(0, 5)}) ${rLabel}:</span> ${escapeHtml(r.notes)}</div>`,
        );
      }

      if (parts.length === 0) return "";

      return `<div style="margin-bottom:8px">
          <p style="font-size:10px;font-weight:700;color:#e4e4e7;margin-bottom:3px">${idx + 1}. ${escapeHtml(inst.installationName)}</p>
          <div style="font-size:9px;color:#d4d4d8;padding-left:12px">${parts.join("")}</div>
        </div>`;
    })
    .filter(Boolean)
    .join("");

  const rondaHeaders = (reporte.instalaciones[0]?.rondas || [])
    .map(
      (r, i) =>
        `<th style="padding:2px 3px;border:1px solid #333;font-size:8px;text-align:center;background:#1e1e2e;color:#a5b4fc;min-width:38px">R${i + 1}<br/>${r.horaEsperada.slice(0, 5)}</th>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e4e4e7; padding: 24px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #1e1e2e; color: #a5b4fc; padding: 4px 6px; border: 1px solid #333; font-size: 9px; text-align: left; }
    td { vertical-align: top; }
    tr:nth-child(even) td { background: #111118; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div>
      <h1 style="font-size:16px;font-weight:700;color:#a5b4fc">Control de Guardia Nocturna</h1>
      <p style="font-size:11px;color:#a1a1aa;margin-top:2px">${escapeHtml(reporte.centralOperatorName)}${reporte.centralLabel ? ` · ${escapeHtml(reporte.centralLabel)}` : ""}</p>
    </div>
    <div style="text-align:right">
      <p style="font-size:12px;font-weight:600">${dateFormatted}</p>
      <p style="font-size:10px;color:#a1a1aa">${reporte.shiftStart} – ${reporte.shiftEnd}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px;text-align:center">N°</th>
        <th style="min-width:100px">Instalación</th>
        <th>Guardia nocturno</th>
        <th style="text-align:center;min-width:50px">Llegada</th>
        ${rondaHeaders}
        <th style="text-align:center;min-width:50px">Llegada día</th>
        <th>Guardia día</th>
      </tr>
    </thead>
    <tbody>
      ${instRows}
    </tbody>
  </table>

  ${reporte.generalNotes ? `<div style="margin-top:16px;padding:8px 12px;background:#1e1e2e;border-radius:6px;border:1px solid #333"><p style="font-size:9px;color:#a5b4fc;font-weight:600;margin-bottom:4px">Notas generales</p><p style="font-size:10px;color:#d4d4d8;white-space:pre-wrap">${escapeHtml(reporte.generalNotes)}</p></div>` : ""}

  ${notesEntries ? `<div style="margin-top:16px;padding:8px 12px;background:#1e1e2e;border-radius:6px;border:1px solid #333"><p style="font-size:10px;color:#a5b4fc;font-weight:700;margin-bottom:8px">Comentarios por instalación y rondas</p>${notesEntries}</div>` : ""}

  <div style="margin-top:12px;display:flex;gap:16px;font-size:9px;color:#71717a">
    <span>Total instalaciones: ${reporte.instalaciones.length}</span>
    <span>Normal: ${reporte.instalaciones.filter((i) => i.statusInstalacion === "normal").length}</span>
    <span style="color:#d97706">Novedad: ${reporte.instalaciones.filter((i) => i.statusInstalacion === "novedad").length}</span>
    <span style="color:#dc2626">Crítico: ${reporte.instalaciones.filter((i) => i.statusInstalacion === "critico").length}</span>
  </div>
</body>
</html>`;
}

export async function getControlNocturnoForPdf(reporteId: string, tenantId: string) {
  return prisma.opsControlNocturno.findFirst({
    where: { id: reporteId, tenantId },
    include: {
      instalaciones: {
        include: {
          guardias: { orderBy: { createdAt: "asc" } },
          rondas: { orderBy: { rondaNumber: "asc" } },
        },
        orderBy: { orderIndex: "asc" },
      },
    },
  });
}

export async function renderControlNocturnoPdfBuffer(
  reporte: ControlNocturnoPdfReporte,
): Promise<Uint8Array> {
  const html = buildControlNocturnoPdfHtml(reporte);
  const isDev = process.env.NODE_ENV === "development";
  const executablePath = isDev ? undefined : await chromiumPkg.executablePath();

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: isDev ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromiumPkg.args,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A3",
      landscape: true,
      printBackground: true,
      margin: { top: "12px", bottom: "12px", left: "12px", right: "12px" },
    });
    return new Uint8Array(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function generateControlNocturnoPdfBuffer(
  reporteId: string,
  tenantId: string,
): Promise<Uint8Array> {
  const reporte = await getControlNocturnoForPdf(reporteId, tenantId);
  if (!reporte) {
    throw new Error("Reporte no encontrado");
  }
  return renderControlNocturnoPdfBuffer(reporte);
}

export function buildControlNocturnoPdfFileName(date: Date): string {
  return `ControlNocturno_${date.toISOString().slice(0, 10)}.pdf`;
}
