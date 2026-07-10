/**
 * Tarjeta "Cierre de supervisión": resumen de la visita al cerrarla (checkout).
 * Sigue el estilo de `cierre-turno-blocks.ts` (rondas): header con estado,
 * context con supervisor/horas/duración, KPIs, hallazgos, comentarios, fotos
 * embebidas y botón "Ver reporte completo". Se publica al canal del módulo ops.
 */

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 150), emoji: true });
const CHILE_TZ = "America/Santiago";

export interface SupervisionCierreInput {
  installationName: string;
  supervisorName: string;
  checkInAt: Date;
  checkOutAt: Date;
  durationMinutes: number | null;
  checkInGeoValidada: boolean | null;
  checkInDistanciaM: number | null;
  checkOutGeoValidada: boolean | null;
  checkOutDistanciaM: number | null;
  installationState: string | null;
  guardsFound: number | null;
  guardsExpected: number | null;
  healthScore: number | null;
  generalComments: string | null;
  findings: Array<{ severity: string; description: string }>; // solo status "open"
  photoUrls: string[]; // ya combinadas y deduplicadas, máx 6 a mostrar
  totalPhotoCount: number; // total real (para el "+N más")
  reportUrl: string;
}

function hora(d: Date): string {
  try {
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: CHILE_TZ,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

const INSTALLATION_STATE_LABELS: Record<string, string> = {
  optimo: "Óptimo",
  requiere_atencion: "Requiere atención",
  critico: "Crítico",
  bueno: "Bueno",
  regular: "Regular",
};

function installationStateLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (INSTALLATION_STATE_LABELS[key]) return INSTALLATION_STATE_LABELS[key];
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
  return capitalized.replace(/_/g, " ");
}

function geoField(validada: boolean | null, distanciaM: number | null): string {
  if (validada == null) return "— sin datos";
  const dist = distanciaM != null ? ` (${distanciaM} m)` : "";
  return validada ? `✓ Validada${dist}` : `✗ Fuera de rango${dist}`;
}

const SEVERITY: Record<string, { emoji: string; label: string }> = {
  critical: { emoji: "🔴", label: "Crítico" },
  major: { emoji: "🔴", label: "Mayor" },
  minor: { emoji: "🟡", label: "Menor" },
};

function severityMeta(severity: string): { emoji: string; label: string } {
  return SEVERITY[severity.trim().toLowerCase()] ?? { emoji: "🟡", label: "Menor" };
}

export function buildSupervisionCierreBlocks(input: SupervisionCierreInput): {
  text: string;
  blocks: unknown[];
} {
  const hasSerious = input.findings.some((f) => {
    const s = f.severity.trim().toLowerCase();
    return s === "critical" || s === "major";
  });
  const estado = hasSerious ? "⚠️" : "✅";

  // Context: supervisor + horas + duración.
  let contextText = `Supervisor *${input.supervisorName}* · ${hora(input.checkInAt)} → ${hora(input.checkOutAt)}`;
  if (input.durationMinutes != null) {
    contextText += ` · Duración *${input.durationMinutes} min*`;
  }

  // KPIs (máx 6 fields por límite de Slack).
  const fields: string[] = [
    `*Geocerca entrada*\n${geoField(input.checkInGeoValidada, input.checkInDistanciaM)}`,
    `*Geocerca salida*\n${geoField(input.checkOutGeoValidada, input.checkOutDistanciaM)}`,
  ];
  if (input.installationState) {
    fields.push(`*Estado instalación*\n${installationStateLabel(input.installationState)}`);
  }
  if (input.guardsFound != null || input.guardsExpected != null) {
    let guardsVal: string;
    if (input.guardsFound != null && input.guardsExpected != null) {
      guardsVal = `${input.guardsFound} / ${input.guardsExpected} presentes`;
    } else if (input.guardsFound != null) {
      guardsVal = `${input.guardsFound} presentes`;
    } else {
      guardsVal = `${input.guardsExpected} esperados`;
    }
    fields.push(`*Guardias*\n${guardsVal}`);
  }
  if (input.healthScore != null) {
    fields.push(`*Health score*\n${input.healthScore} / 100`);
  }

  const blocks: unknown[] = [
    { type: "header", text: pt(`${estado} Cierre de supervisión · ${input.installationName}`) },
    { type: "context", elements: [{ type: "mrkdwn", text: contextText }] },
    { type: "section", fields: fields.slice(0, 6).map((text) => ({ type: "mrkdwn", text })) },
  ];

  // Hallazgos.
  if (input.findings.length > 0) {
    const shown = input.findings.slice(0, 8);
    const lines = shown.map((f) => {
      const { emoji, label } = severityMeta(f.severity);
      return `${emoji} *${label}* — ${f.description.slice(0, 150)}`;
    });
    if (input.findings.length > shown.length) {
      lines.push(`…y ${input.findings.length - shown.length} más`);
    }
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Hallazgos detectados (${input.findings.length})*` },
    });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } });
  }

  // Comentarios generales.
  const comments = input.generalComments?.trim();
  if (comments) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Comentarios*" } });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: comments.slice(0, 500) } });
  }

  // Evidencia fotográfica.
  if (input.photoUrls.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Evidencia fotográfica*" } });
    for (const url of input.photoUrls.slice(0, 6)) {
      blocks.push({ type: "image", image_url: url, alt_text: "Foto de supervisión" });
    }
    if (input.totalPhotoCount > input.photoUrls.length) {
      blocks.push({
        type: "context",
        elements: [
          { type: "mrkdwn", text: `+${input.totalPhotoCount - input.photoUrls.length} fotos más en el reporte` },
        ],
      });
    }
  }

  // Footer + botón.
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Enviado al cerrar la visita · Supervisión · OPAI" }],
  });
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        action_id: "supervision_ver_reporte",
        text: pt("Ver reporte completo"),
        url: input.reportUrl,
        style: "primary",
      },
    ],
  });

  const text = `${estado} Cierre de supervisión · ${input.installationName} — ${input.findings.length} hallazgos, health ${input.healthScore ?? "—"}`;
  return { text, blocks };
}
