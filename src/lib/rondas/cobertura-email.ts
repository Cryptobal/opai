/**
 * Email template for coverage snapshot.
 *
 * Sends a mid-shift summary of guard coverage per installation
 * to the ops email (operaciones@gard.cl).
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CoberturaGuardia {
  nombre: string;
  status: string; // pendiente, en_camino, presente, no_viene, reemplazo
  turno: string; // nocturno, diurno
  horaLlegada: string | null;
}

export interface CoberturaInstalacion {
  name: string;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  coberturaStatus: string; // completa, parcial, descubierta, pendiente
  guardias: CoberturaGuardia[];
  noViene: string[]; // names of guards with no_viene status
}

export interface CoberturaSnapshot {
  instalaciones: CoberturaInstalacion[];
  summary: {
    completas: number;
    parciales: number;
    descubiertas: number;
    pendientes: number;
    total: number;
  };
}

interface CoberturaEmailMetadata {
  operatorName: string;
  turnoStartedAt: Date;
  baseUrl: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusColor(status: string): string {
  switch (status) {
    case "completa":
      return "#15803d";
    case "parcial":
      return "#d97706";
    case "descubierta":
      return "#dc2626";
    default:
      return "#475569";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completa":
      return "Completa";
    case "parcial":
      return "Parcial";
    case "descubierta":
      return "Descubierta";
    default:
      return "Pendiente";
  }
}

function guardStatusLabel(status: string): string {
  switch (status) {
    case "presente":
      return "Presente";
    case "no_viene":
      return "No viene";
    case "en_camino":
      return "En camino";
    case "reemplazo":
      return "Reemplazo";
    default:
      return "Pendiente";
  }
}

function guardStatusColor(status: string): string {
  switch (status) {
    case "presente":
    case "reemplazo":
      return "#15803d";
    case "no_viene":
      return "#dc2626";
    case "en_camino":
      return "#d97706";
    default:
      return "#475569";
  }
}

/* ------------------------------------------------------------------ */
/*  Build snapshot from DB data                                        */
/* ------------------------------------------------------------------ */

export function buildCoberturaSnapshot(
  instalaciones: {
    installationName: string;
    guardiasRequeridos: number;
    guardiasPresentes: number;
    coberturaStatus: string;
    guardias: {
      guardiaNombre: string;
      status: string;
      turno: string;
      horaLlegada: string | null;
    }[];
  }[],
): CoberturaSnapshot {
  const mapped: CoberturaInstalacion[] = instalaciones.map((inst) => ({
    name: inst.installationName,
    guardiasRequeridos: inst.guardiasRequeridos,
    guardiasPresentes: inst.guardiasPresentes,
    coberturaStatus: inst.coberturaStatus,
    guardias: inst.guardias.map((g) => ({
      nombre: g.guardiaNombre,
      status: g.status,
      turno: g.turno,
      horaLlegada: g.horaLlegada,
    })),
    noViene: inst.guardias
      .filter((g) => g.status === "no_viene")
      .map((g) => g.guardiaNombre),
  }));

  const summary = {
    completas: mapped.filter((i) => i.coberturaStatus === "completa").length,
    parciales: mapped.filter((i) => i.coberturaStatus === "parcial").length,
    descubiertas: mapped.filter((i) => i.coberturaStatus === "descubierta")
      .length,
    pendientes: mapped.filter((i) => i.coberturaStatus === "pendiente").length,
    total: mapped.length,
  };

  return { instalaciones: mapped, summary };
}

/* ------------------------------------------------------------------ */
/*  Build HTML                                                         */
/* ------------------------------------------------------------------ */

export function buildCoberturaEmailHtml(
  snapshot: CoberturaSnapshot,
  meta: CoberturaEmailMetadata,
): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = now.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const turnoStart = meta.turnoStartedAt.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const baseUrl = meta.baseUrl.replace(/\/+$/, "");
  const monitorUrl = `${baseUrl}/ops/rondas/monitoreo`;

  const { summary } = snapshot;

  const instalacionRows = snapshot.instalaciones
    .map((inst) => {
      const color = statusColor(inst.coberturaStatus);
      const bgColor =
        inst.coberturaStatus === "descubierta" ? "#fef2f2" : "#ffffff";

      const guardLines = inst.guardias
        .map((g) => {
          const gColor = guardStatusColor(g.status);
          const arrival = g.horaLlegada ? ` (${escapeHtml(g.horaLlegada)})` : "";
          return `<span style="color:${gColor};font-size:11px">${escapeHtml(g.nombre)} - ${guardStatusLabel(g.status)}${arrival}</span>`;
        })
        .join("<br/>");

      const noVieneStr =
        inst.noViene.length > 0
          ? `<span style="color:#dc2626;font-size:11px;font-weight:600">${inst.noViene.map(escapeHtml).join(", ")}</span>`
          : '<span style="color:#94a3b8;font-size:11px">—</span>';

      return `<tr style="background:${bgColor}">
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;font-weight:500">${escapeHtml(inst.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;text-align:center">${inst.guardiasPresentes}/${inst.guardiasRequeridos}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;color:#fff;background:${color}">${statusLabel(inst.coberturaStatus)}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${guardLines || '<span style="color:#94a3b8;font-size:11px">—</span>'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${noVieneStr}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="700" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:24px 32px">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">Snapshot de Cobertura</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff">${escapeHtml(dateStr)} · ${timeStr}</p>
          </td>
        </tr>
        <!-- Metadata -->
        <tr>
          <td style="padding:20px 32px 16px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#64748b;width:140px">Operador</td>
                <td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${escapeHtml(meta.operatorName)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#64748b">Inicio turno</td>
                <td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${turnoStart}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- KPIs -->
        <tr>
          <td style="padding:0 32px 16px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
              <tr>
                <td style="padding:12px 16px;text-align:center;border-right:1px solid #e2e8f0;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:#15803d">${summary.completas}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Completas</p>
                </td>
                <td style="padding:12px 16px;text-align:center;border-right:1px solid #e2e8f0;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:#d97706">${summary.parciales}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Parciales</p>
                </td>
                <td style="padding:12px 16px;text-align:center;border-right:1px solid #e2e8f0;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:#dc2626">${summary.descubiertas}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Descubiertas</p>
                </td>
                <td style="padding:12px 16px;text-align:center;width:25%">
                  <p style="margin:0;font-size:24px;font-weight:700;color:#475569">${summary.pendientes}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#64748b">Pendientes</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Table -->
        <tr>
          <td style="padding:0 32px 24px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
              <tr style="background:#f8fafc">
                <th style="padding:8px 12px;font-size:11px;color:#64748b;text-align:left;font-weight:600;border-bottom:1px solid #e2e8f0">Instalacion</th>
                <th style="padding:8px 12px;font-size:11px;color:#64748b;text-align:center;font-weight:600;border-bottom:1px solid #e2e8f0">Guardias</th>
                <th style="padding:8px 12px;font-size:11px;color:#64748b;text-align:center;font-weight:600;border-bottom:1px solid #e2e8f0">Estado</th>
                <th style="padding:8px 12px;font-size:11px;color:#64748b;text-align:left;font-weight:600;border-bottom:1px solid #e2e8f0">Detalle</th>
                <th style="padding:8px 12px;font-size:11px;color:#64748b;text-align:left;font-weight:600;border-bottom:1px solid #e2e8f0">No viene</th>
              </tr>
              ${instalacionRows}
            </table>
          </td>
        </tr>
        <!-- CTA -->
        <tr>
          <td style="padding:0 32px 24px" align="center">
            <a
              href="${monitorUrl}"
              target="_blank"
              rel="noopener noreferrer"
              style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px"
            >
              Ver en OPAI
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">
              Sistema OPAI - Snapshot generado automaticamente
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
