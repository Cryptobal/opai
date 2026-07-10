/**
 * Block Kit del tablero de relevo (mensaje-ficha auto-editable). Espejo del
 * mockup aprobado: saliente informativo (sin botones) + entrante con botones
 * por guardia. Slack no da color por bloque → semáforo por emoji.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { normalizeWaPhone } from "@/lib/integrations/slack/comercial/lead-actions";
import { buildWaUrl } from "@/lib/psych/normalizePhone";
import type { RelevoBoardData, RelevoGuardiaRow } from "@/lib/ops/relevo-board-data";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });
const CHILE_TZ = "America/Santiago";
const PRESENT_STATES = new Set(["asistio", "presente", "confirmado_llegada"]);

function estadoEmoji(estado: string, nombre: string): string {
  if (PRESENT_STATES.has(estado)) return "🟢";
  if (estado === "en_camino") return "🟡";
  if (estado === "no_asistio") return "🔴";
  if (estado === "ppc" || nombre === "PPC") return "🟠";
  return "⚪";
}

function hora(d: Date | null): string {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("es-CL", { timeZone: CHILE_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    return "";
  }
}

function verButton(): Record<string, unknown> {
  return { type: "button", action_id: "asist_ver", text: pt("Ver"), url: `${getCanonicalSiteUrl()}/ops/marcaciones` };
}

/** Primer nombre para saludo en WhatsApp ("Carlos Muñoz" → "Carlos"). */
function firstName(nombre: string): string {
  const n = nombre.trim();
  if (!n || n === "PPC") return "guardia";
  return n.split(/\s+/)[0] ?? n;
}

/** Mensaje pre-llenado para confirmar si el guardia va en camino al relevo. */
function relevoWaMessage(nombre: string, installationName: string, puesto: string): string {
  return (
    `Hola ${firstName(nombre)}, te contactamos desde central por tu turno en ${installationName} (${puesto}). ` +
    `¿Puedes confirmar si ya vas en camino? ` +
    `Si no puedes asistir, gracias por avisarnos para gestionar el relevo.`
  );
}

function telefonoLine(telefono: string | null): string | null {
  if (!telefono) return null;
  const digits = normalizeWaPhone(telefono);
  if (!digits) return null;
  return `📞 <tel:+${digits}|${telefono}>`;
}

function whatsappButton(
  r: RelevoGuardiaRow,
  installationName: string,
): Record<string, unknown> | null {
  const digits = normalizeWaPhone(r.telefono);
  if (!digits || r.nombre === "PPC") return null;
  const url = buildWaUrl(digits, relevoWaMessage(r.nombre, installationName, r.puesto));
  return { type: "button", action_id: `asist_wa_${r.asistenciaId}`, url, text: pt("🟢 WhatsApp") };
}

/** Fila del turno saliente (informativa): verde si marcó salida, sin botones. */
function salienteRow(r: RelevoGuardiaRow): unknown[] {
  const marcoSalida = !!r.checkOutAt;
  const emoji = marcoSalida ? "🟢" : "⚪";
  const meta = marcoSalida ? `salió ${hora(r.checkOutAt)}` : "sin marca de salida";
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `${emoji} *${r.nombre}* · ${r.puesto}\n_${r.rut || "—"} · ${meta}_` },
    },
  ];
}

/** Fila del turno entrante: semáforo + botones según estado. */
function entranteRow(r: RelevoGuardiaRow, installationName: string): unknown[] {
  const emoji = estadoEmoji(r.estado, r.nombre);
  const present = PRESENT_STATES.has(r.estado);
  const metaBits: string[] = [r.rut || "—"];
  if (r.checkInAt) metaBits.push(`entró ${hora(r.checkInAt)}`);
  if (r.contactoResultado) metaBits.push(`central: ${r.contactoResultado}`);

  const tel = telefonoLine(r.telefono);
  const lines = [`${emoji} *${r.nombre}* · ${r.puesto}`, `_${metaBits.join(" · ")}_`];
  if (tel) lines.push(tel);

  const section = {
    type: "section",
    text: { type: "mrkdwn", text: lines.join("\n") },
  };

  const elements: Record<string, unknown>[] = [];
  const wa = whatsappButton(r, installationName);
  if (wa) elements.push(wa);
  if (present) {
    elements.push(verButton());
  } else {
    if (r.estado === "en_camino") {
      elements.push({ type: "button", action_id: `asist_confirmar_${r.asistenciaId}`, value: r.asistenciaId, style: "primary", text: pt("✓ Confirmar llegada") });
    }
    elements.push({ type: "button", action_id: `asist_camino_${r.asistenciaId}`, value: r.asistenciaId, text: pt("📞 En camino") });
    elements.push({ type: "button", action_id: `asist_ausente_${r.asistenciaId}`, value: r.asistenciaId, style: "danger", text: pt("Reportar ausencia") });
  }
  return [section, { type: "actions", block_id: `asist_row_${r.asistenciaId}`, elements }];
}

/** Construye `{ text, blocks }` del tablero de relevo. */
export function buildRelevoBlocks(data: RelevoBoardData): { text: string; blocks: unknown[] } {
  const { cobertura } = data;
  const pill = data.entrante.length && cobertura.cubiertos === cobertura.total ? "✅ Completo" : "🟠 Control en curso";
  const blocks: unknown[] = [
    { type: "header", text: pt(`🔄 Relevo · ${data.installationName}`) },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `${data.turnoLabel} · entra ${data.shiftStart} · *${pill}*` }],
    },
    { type: "divider" },
  ];

  if (data.saliente.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Turno saliente* · informativo" } });
    for (const r of data.saliente) blocks.push(...salienteRow(r));
    blocks.push({ type: "divider" });
  }

  blocks.push({ type: "section", text: { type: "mrkdwn", text: "*Turno entrante*" } });
  if (data.entrante.length === 0) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Sin puestos para este turno." }] });
  } else {
    for (const r of data.entrante) blocks.push(...entranteRow(r, data.installationName));
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `*Cobertura:* ${cobertura.cubiertos}/${cobertura.total} · ${cobertura.ppc} PPC` },
    accessory: { type: "button", action_id: "asist_ver_pauta", text: pt("Ver pauta"), url: `${getCanonicalSiteUrl()}/ops/pauta-diaria` },
  });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Auto-actualiza al marcar · Operaciones · OPAI" }] });

  const text = `🔄 Relevo · ${data.installationName} · ${data.turnoLabel} · ${cobertura.cubiertos}/${cobertura.total} cubiertos`;
  return { text, blocks };
}
