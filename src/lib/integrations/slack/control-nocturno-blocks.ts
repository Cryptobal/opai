/**
 * Tarjeta "🌙 Cambios de turno · por instalación": resumen del Control Nocturno
 * al enviarlo (mismo momento que `sendControlNocturnoEmail`). Una línea por
 * instalación con guardia(s) día, hora de llegada, requeridos/presentes y
 * semáforo por `statusInstalacion`. Se publica al canal del módulo ops.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 150), emoji: true });

export interface ControlNocturnoInstalacionInput {
  installationName: string;
  statusInstalacion: string;
  guardiasRequeridos: number;
  guardiasPresentes: number;
  horaLlegadaTurnoDia?: string | null;
  guardiaDiaNombres?: string | null;
}

export interface ControlNocturnoInput {
  reporteId: string;
  date: Date | string;
  centralLabel?: string | null;
  instalaciones: ControlNocturnoInstalacionInput[];
}

function statusEmoji(status: string): string {
  if (status === "critico") return "🔴";
  if (status === "novedad") return "🟡";
  if (status === "no_aplica") return "⚫";
  return "🟢";
}

/** Extrae nombres legibles de `guardiaDiaNombres` (JSON [{nombre,hora}] o texto plano). */
function guardiaNames(raw?: string | null): string {
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw) as Array<{ nombre?: string }>;
    if (Array.isArray(parsed)) {
      const names = parsed.map((p) => p.nombre).filter(Boolean);
      return names.length ? names.join(", ") : "—";
    }
  } catch {
    // no era JSON → texto plano
  }
  return raw;
}

function dateLabel(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

export function buildControlNocturnoBlocks(cn: ControlNocturnoInput): { text: string; blocks: unknown[] } {
  const blocks: unknown[] = [
    { type: "header", text: pt("🌙 Cambios de turno · por instalación") },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `${dateLabel(cn.date)}${cn.centralLabel ? ` · ${cn.centralLabel}` : ""} · ${cn.instalaciones.length} instalaciones` }],
    },
    { type: "divider" },
  ];

  const rows = cn.instalaciones.slice(0, 30);
  for (const i of rows) {
    const nombres = guardiaNames(i.guardiaDiaNombres);
    const llegada = i.horaLlegadaTurnoDia ? `llegó ${i.horaLlegadaTurnoDia}` : "sin hora de llegada";
    const cobertura = `${i.guardiasPresentes}/${i.guardiasRequeridos}`;
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${statusEmoji(i.statusInstalacion)} *${i.installationName}* · ${cobertura}\n_${nombres} · ${llegada}_` },
    });
  }
  if (cn.instalaciones.length > rows.length) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `…y ${cn.instalaciones.length - rows.length} más` }] });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "actions",
    elements: [{ type: "button", action_id: "cn_ver_control", text: pt("Ver control"), url: `${getCanonicalSiteUrl()}/ops/control-nocturno`, style: "primary" }],
  });

  const criticos = cn.instalaciones.filter((i) => i.statusInstalacion === "critico").length;
  const novedades = cn.instalaciones.filter((i) => i.statusInstalacion === "novedad").length;
  const text = `🌙 Cambios de turno — ${cn.instalaciones.length} instalaciones, ${novedades} con novedad, ${criticos} críticas`;
  return { text, blocks };
}
