/**
 * Email template for coverage snapshot.
 *
 * Sends a per-turno summary of guard coverage per installation
 * to the ops email configured for the tenant.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CoberturaGuardia {
  nombre: string;
  status: string; // pendiente, en_camino, presente, no_viene, reemplazo
  turno: string; // nocturno, diurno
  horaPlanificada: string | null; // planned shift start from puesto (e.g. "19:00")
  horaLlegada: string | null;
  isExtra: boolean;
  notes: string | null;
}

export interface CoberturaInstalacion {
  name: string;
  guardiasRequeridos: number;
  coberturaStatus: string; // completa, parcial, descubierta, pendiente
  guardias: CoberturaGuardia[];
  presentes: number;
  extras: number;
  noViene: { nombre: string; notes: string | null }[];
  notes: string | null; // Installation-level operator notes
}

export interface CoberturaSnapshot {
  turnoFilter: "nocturno" | "diurno";
  turnoLabel: string;
  instalaciones: CoberturaInstalacion[];
  summary: {
    completas: number;
    parciales: number;
    descubiertas: number;
    pendientes: number;
    total: number;
    totalGuardias: number;
    totalPresentes: number;
    totalNoViene: number;
    totalExtras: number;
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

function guardStatusIcon(status: string): string {
  switch (status) {
    case "presente":
      return "✅";
    case "reemplazo":
      return "🔄";
    case "no_viene":
      return "❌";
    case "en_camino":
      return "🚗";
    default:
      return "⏳";
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

function calculateTurnoCoberturaStatus(
  guardiasRequeridos: number,
  guardias: { status: string }[],
): string {
  const presentes = guardias.filter(
    (g) => g.status === "presente" || g.status === "reemplazo",
  ).length;
  const noVienen = guardias.filter((g) => g.status === "no_viene").length;
  const pendientes = guardias.filter(
    (g) => g.status === "pendiente" || g.status === "en_camino",
  ).length;

  if (presentes >= guardiasRequeridos) return "completa";
  if (presentes > 0 && pendientes > 0) return "parcial";
  if (noVienen > 0 && presentes + pendientes < guardiasRequeridos)
    return "descubierta";
  if (presentes > 0) return "parcial";
  return "pendiente";
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
    notes?: string | null;
    guardias: {
      guardiaId?: string | null;
      guardiaNombre: string;
      status: string;
      turno: string;
      horaLlegada: string | null;
      isExtra: boolean;
      notes: string | null;
    }[];
  }[],
  turnoFilter: "nocturno" | "diurno",
  /** Map of guardiaId → planned shift start (e.g. "19:00") from pauta mensual */
  shiftMap?: Map<string, string>,
  /** Map of guardiaId → checkInAt from asistencia diaria (enriches pending guards) */
  asistenciaMap?: Map<string, { checkInAt: Date }>,
): CoberturaSnapshot {
  const turnoLabel =
    turnoFilter === "nocturno"
      ? "Cobertura Nocturna"
      : "Cobertura Diurna";

  const mapped: CoberturaInstalacion[] = instalaciones.map((inst) => {
    // Filter guards by turno
    const turnoGuardias = inst.guardias.filter((g) =>
      turnoFilter === "nocturno"
        ? g.turno === "nocturno" || !g.turno
        : g.turno === "diurno",
    );

    // Enrich guard status from asistencia diaria:
    // If a guard is still "pendiente" in the operator grid but has a checkIn
    // in asistencia diaria, auto-promote to "presente" with the arrival time.
    const enrichedGuardias = turnoGuardias.map((g) => {
      if (
        g.guardiaId &&
        (g.status === "pendiente" || g.status === "en_camino") &&
        asistenciaMap?.has(g.guardiaId)
      ) {
        const att = asistenciaMap.get(g.guardiaId)!;
        const llegada = att.checkInAt.toLocaleTimeString("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Santiago",
        });
        return { ...g, status: "presente", horaLlegada: g.horaLlegada ?? llegada };
      }
      return g;
    });

    const presentes = enrichedGuardias.filter(
      (g) => g.status === "presente" || g.status === "reemplazo",
    ).length;
    const extras = enrichedGuardias.filter((g) => g.isExtra).length;
    const noViene = enrichedGuardias
      .filter((g) => g.status === "no_viene")
      .map((g) => ({ nombre: g.guardiaNombre, notes: g.notes }));

    // Recalculate cobertura for this specific turno
    const requeridos =
      turnoFilter === "nocturno"
        ? inst.guardiasRequeridos
        : enrichedGuardias.length || 1;
    const coberturaStatus = calculateTurnoCoberturaStatus(
      requeridos,
      enrichedGuardias,
    );

    return {
      name: inst.installationName,
      guardiasRequeridos: requeridos,
      coberturaStatus,
      guardias: enrichedGuardias.map((g) => ({
        nombre: g.guardiaNombre,
        status: g.status,
        turno: g.turno,
        horaPlanificada: (g.guardiaId && shiftMap?.get(g.guardiaId)) ?? null,
        horaLlegada: g.horaLlegada,
        isExtra: g.isExtra,
        notes: g.notes,
      })),
      presentes,
      extras,
      noViene,
      notes: inst.notes ?? null,
    };
  });

  // Only include installations that have guards for this turno
  const withGuards = mapped.filter((i) => i.guardias.length > 0);

  const summary = {
    completas: withGuards.filter((i) => i.coberturaStatus === "completa")
      .length,
    parciales: withGuards.filter((i) => i.coberturaStatus === "parcial")
      .length,
    descubiertas: withGuards.filter(
      (i) => i.coberturaStatus === "descubierta",
    ).length,
    pendientes: withGuards.filter((i) => i.coberturaStatus === "pendiente")
      .length,
    total: withGuards.length,
    totalGuardias: withGuards.reduce((s, i) => s + i.guardias.length, 0),
    totalPresentes: withGuards.reduce((s, i) => s + i.presentes, 0),
    totalNoViene: withGuards.reduce((s, i) => s + i.noViene.length, 0),
    totalExtras: withGuards.reduce((s, i) => s + i.extras, 0),
  };

  return { turnoFilter, turnoLabel, instalaciones: withGuards, summary };
}

/* ------------------------------------------------------------------ */
/*  Build chat summary (plain text for chat message)                   */
/* ------------------------------------------------------------------ */

export function buildCoberturaChatSummary(snapshot: CoberturaSnapshot): string {
  const { summary, turnoLabel, instalaciones } = snapshot;
  const lines: string[] = [];

  lines.push(`📊 ${turnoLabel}`);
  lines.push("");
  lines.push(
    `✅ ${summary.completas} completas · ⚠️ ${summary.parciales} parciales · 🔴 ${summary.descubiertas} descubiertas · ⏳ ${summary.pendientes} pendientes`,
  );
  lines.push(
    `👥 ${summary.totalPresentes}/${summary.totalGuardias} presentes` +
      (summary.totalExtras > 0
        ? ` (${summary.totalExtras} extra${summary.totalExtras !== 1 ? "s" : ""})`
        : "") +
      (summary.totalNoViene > 0
        ? ` · ❌ ${summary.totalNoViene} no viene${summary.totalNoViene !== 1 ? "n" : ""}`
        : ""),
  );

  // List descubiertas
  const descubiertas = instalaciones.filter(
    (i) => i.coberturaStatus === "descubierta",
  );
  if (descubiertas.length > 0) {
    lines.push("");
    lines.push("🔴 Puestos descubiertos:");
    for (const inst of descubiertas) {
      const noVieneNames = inst.noViene
        .map(
          (g) =>
            `${g.nombre}${g.notes ? ` (${g.notes})` : ""}`,
        )
        .join(", ");
      lines.push(
        `  • ${inst.name}: ${inst.presentes}/${inst.guardiasRequeridos} — No viene: ${noVieneNames || "—"}`,
      );
    }
  }

  // List parciales
  const parciales = instalaciones.filter(
    (i) => i.coberturaStatus === "parcial",
  );
  if (parciales.length > 0) {
    lines.push("");
    lines.push("⚠️ Cobertura parcial:");
    for (const inst of parciales) {
      lines.push(
        `  • ${inst.name}: ${inst.presentes}/${inst.guardiasRequeridos}`,
      );
    }
  }

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Build HTML                                                         */
/* ------------------------------------------------------------------ */

export function buildCoberturaEmailHtml(
  snapshot: CoberturaSnapshot,
  meta: CoberturaEmailMetadata,
): string {
  const now = new Date();
  const tz = "America/Santiago";
  const timeStr = now.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const dateStr = now.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  });
  const turnoStart = meta.turnoStartedAt.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const baseUrl = (meta.baseUrl || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://opai.gard.cl").replace(/\/+$/, "");
  const monitorUrl = `${baseUrl}/ops/rondas/monitoreo`;

  const { summary, turnoLabel } = snapshot;
  const headerBg =
    snapshot.turnoFilter === "nocturno" ? "#0f172a" : "#1e3a5f";

  const instalacionRows = snapshot.instalaciones
    .map((inst) => {
      const color = statusColor(inst.coberturaStatus);
      const isDescubierta = inst.coberturaStatus === "descubierta";
      const bgColor = isDescubierta ? "#fef2f2" : "#ffffff";
      const borderLeft = isDescubierta
        ? "border-left:4px solid #dc2626;"
        : "";

      // Build guard detail lines with clearer formatting
      const guardLines = inst.guardias
        .map((g) => {
          const gColor = guardStatusColor(g.status);
          const icon = guardStatusIcon(g.status);
          const scheduled = g.horaPlanificada
            ? ` <span style="color:#64748b;font-size:10px">Turno: ${escapeHtml(g.horaPlanificada)}</span>`
            : "";
          const arrival = g.horaLlegada
            ? ` <span style="color:#64748b;font-size:10px">${g.horaPlanificada ? "· " : ""}Llegada: ${escapeHtml(g.horaLlegada)}</span>`
            : "";
          const extraBadge = g.isExtra
            ? ' <span style="background:#7c3aed;color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;margin-left:4px">EXTRA</span>'
            : ' <span style="background:#e2e8f0;color:#475569;font-size:9px;padding:1px 4px;border-radius:3px;margin-left:4px">PAUTA</span>';
          const notesStr =
            g.notes
              ? `<br/><span style="color:#94a3b8;font-size:10px;padding-left:16px">↳ ${escapeHtml(g.notes)}</span>`
              : "";
          return `<span style="color:${gColor};font-size:11px">${icon} ${escapeHtml(g.nombre)}${extraBadge}${scheduled}${arrival}</span>${notesStr}`;
        })
        .join("<br/>");

      // No viene section with notes
      const noVieneStr =
        inst.noViene.length > 0
          ? inst.noViene
              .map((g) => {
                const noteStr = g.notes
                  ? `<br/><span style="color:#94a3b8;font-size:10px">↳ ${escapeHtml(g.notes)}</span>`
                  : "";
                return `<span style="color:#dc2626;font-size:11px;font-weight:600">❌ ${escapeHtml(g.nombre)}</span>${noteStr}`;
              })
              .join("<br/>")
          : '<span style="color:#94a3b8;font-size:11px">—</span>';

      const instNotesRow = inst.notes
        ? `<tr style="background:${bgColor}">
        <td colspan="5" style="padding:4px 12px 10px;border-bottom:1px solid #e2e8f0;${borderLeft}">
          <span style="color:#64748b;font-size:10px;font-style:italic">📝 ${escapeHtml(inst.notes)}</span>
        </td>
      </tr>`
        : "";

      return `<tr style="background:${bgColor}">
        <td style="padding:10px 12px;${inst.notes ? "" : "border-bottom:1px solid #e2e8f0;"}font-size:12px;color:#1e293b;font-weight:500;${borderLeft}">${escapeHtml(inst.name)}${isDescubierta ? '<br/><span style="color:#dc2626;font-size:10px;font-weight:700">⚠️ PUESTO DESCUBIERTO</span>' : ""}</td>
        <td style="padding:10px 12px;${inst.notes ? "" : "border-bottom:1px solid #e2e8f0;"}font-size:13px;color:#1e293b;text-align:center;font-weight:600">
          <span style="color:${inst.presentes >= inst.guardiasRequeridos ? "#15803d" : inst.presentes > 0 ? "#d97706" : "#dc2626"}">${inst.presentes}</span>/${inst.guardiasRequeridos}${inst.extras > 0 ? `<br/><span style="font-size:10px;color:#7c3aed">+${inst.extras} extra</span>` : ""}
        </td>
        <td style="padding:10px 12px;${inst.notes ? "" : "border-bottom:1px solid #e2e8f0;"}text-align:center">
          <span style="display:inline-block;padding:3px 10px;border-radius:9999px;font-size:10px;font-weight:700;color:#fff;background:${color}">${statusLabel(inst.coberturaStatus)}</span>
        </td>
        <td style="padding:10px 12px;${inst.notes ? "" : "border-bottom:1px solid #e2e8f0;"}">${guardLines || '<span style="color:#94a3b8;font-size:11px">—</span>'}</td>
        <td style="padding:10px 12px;${inst.notes ? "" : "border-bottom:1px solid #e2e8f0;"}">${noVieneStr}</td>
      </tr>${instNotesRow}`;
    })
    .join("\n");

  // Alert banner for descubiertas
  const descubiertasBanner =
    summary.descubiertas > 0
      ? `<tr>
          <td style="padding:0 32px 16px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #dc2626;border-radius:6px">
              <tr>
                <td style="padding:14px 16px;text-align:center">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#dc2626">⚠️ ${summary.descubiertas} instalacion${summary.descubiertas !== 1 ? "es" : ""} con puesto descubierto</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#991b1b">${snapshot.instalaciones.filter((i) => i.coberturaStatus === "descubierta").map((i) => escapeHtml(i.name)).join(" · ")}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table width="720" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
        <!-- Header -->
        <tr>
          <td style="background:${headerBg};padding:24px 32px">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">${escapeHtml(turnoLabel)}</p>
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
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#64748b">Hora reporte</td>
                <td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:500">${timeStr}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Descubiertas alert -->
        ${descubiertasBanner}
        <!-- KPIs -->
        <tr>
          <td style="padding:0 32px 16px">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
              <tr>
                <td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#15803d">${summary.completas}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#64748b">Completas</p>
                </td>
                <td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#d97706">${summary.parciales}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#64748b">Parciales</p>
                </td>
                <td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#dc2626">${summary.descubiertas}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#64748b">Descubiertas</p>
                </td>
                <td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:16%">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#475569">${summary.pendientes}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#64748b">Pendientes</p>
                </td>
                <td style="padding:12px 12px;text-align:center;border-right:1px solid #e2e8f0;width:18%">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#1e293b">${summary.totalPresentes}/${summary.totalGuardias}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#64748b">Presentes</p>
                </td>
                <td style="padding:12px 12px;text-align:center;width:18%">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#dc2626">${summary.totalNoViene}</p>
                  <p style="margin:2px 0 0;font-size:10px;color:#64748b">No vienen</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Table -->
        <tr>
          <td style="padding:0 32px 24px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
              <tr style="background:#f1f5f9">
                <th style="padding:10px 12px;font-size:11px;color:#475569;text-align:left;font-weight:700;border-bottom:2px solid #e2e8f0">Instalación</th>
                <th style="padding:10px 12px;font-size:11px;color:#475569;text-align:center;font-weight:700;border-bottom:2px solid #e2e8f0">Guardias</th>
                <th style="padding:10px 12px;font-size:11px;color:#475569;text-align:center;font-weight:700;border-bottom:2px solid #e2e8f0">Estado</th>
                <th style="padding:10px 12px;font-size:11px;color:#475569;text-align:left;font-weight:700;border-bottom:2px solid #e2e8f0">Detalle</th>
                <th style="padding:10px 12px;font-size:11px;color:#475569;text-align:left;font-weight:700;border-bottom:2px solid #e2e8f0">No viene</th>
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
              style="display:inline-block;background:${headerBg};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px"
            >
              Ver en OPAI
            </a>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e2e8f0">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center">
              Sistema OPAI — Snapshot generado automáticamente
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;text-align:center">
              ¿No quieres recibir este tipo de alertas?
              <a href="${baseUrl}/opai/perfil/notificaciones" style="color:#0ea5e9;text-decoration:underline">Administrar notificaciones</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
