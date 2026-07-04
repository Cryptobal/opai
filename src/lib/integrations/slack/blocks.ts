/**
 * Construcción de tarjetas Block Kit para notificaciones salientes.
 *
 * Fase 1: sólo botones de tipo URL ("Ver en OPAI"). Los botones de acción
 * (interactividad) llegan en Fase 2.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

export interface NotificationBlocksInput {
  title: string;
  body?: string | null;
  category: string;
  link?: string | null;
  critical?: boolean;
  /** Teléfono del contacto: agrega línea '📞 Llamar' tappable (mrkdwn tel:). */
  phone?: string | null;
  /** Pares clave-valor de contexto (≤6) renderizados como sección `fields`. */
  fields?: Array<{ label: string; value: string }> | null;
}

const HEADER_MAX = 150;
const BODY_MAX = 2900;
const MAX_FIELDS = 6;

/** Claves que NUNCA se muestran como campo (ids, urls, tokens, phone* ya en la línea 📞). */
const FIELD_KEY_BLACKLIST = /(^id$|Id$|^url|token|^link$|^phone|^docRef$)/i;

/** Humaniza una clave camelCase/snake_case a un label legible ("slaDueAt" → "Sla Due At"). */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Deriva hasta 6 campos de contexto de `data`: sólo primitivos cortos, sin
 * ids/urls/tokens. Labels humanizadas. Es el renderer genérico de las tarjetas;
 * los enrichers por tipo enriquecen `data` con claves ya legibles.
 */
export function toContextFields(
  data?: Record<string, unknown> | null,
): Array<{ label: string; value: string }> {
  if (!data) return [];
  const fields: Array<{ label: string; value: string }> = [];
  for (const [k, v] of Object.entries(data)) {
    if (fields.length >= MAX_FIELDS) break;
    if (FIELD_KEY_BLACKLIST.test(k)) continue;
    if (v === null || v === undefined || typeof v === "object") continue;
    const value = typeof v === "boolean" ? (v ? "Sí" : "No") : String(v);
    if (!value || value.length > 80) continue;
    fields.push({ label: humanizeKey(k), value });
  }
  return fields;
}

function toAbsolute(link: string): string {
  if (/^https?:\/\//.test(link)) return link;
  const base = getCanonicalSiteUrl();
  return link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
}

/** Devuelve `{ text, blocks }`: text es el fallback para notificaciones/accesibilidad. */
export function buildNotificationBlocks(input: NotificationBlocksInput): {
  text: string;
  blocks: unknown[];
} {
  const prefix = input.critical ? "🚨 " : "";
  const headerText = `${prefix}${input.title}`.slice(0, HEADER_MAX);
  const body = (input.body ?? "").slice(0, BODY_MAX);

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
  ];

  if (body) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: body } });
  }

  const fields = (input.fields ?? []).slice(0, MAX_FIELDS);
  if (fields.length) {
    blocks.push({
      type: "section",
      fields: fields.map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}` })),
    });
  }

  if (input.phone) {
    const telHref = input.phone.replace(/[^+\d]/g, "");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `📞 <tel:${telHref}|Llamar ${input.phone}>` },
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `${input.category} · OPAI` }],
  });

  if (input.link) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Ver en OPAI", emoji: true },
          url: toAbsolute(input.link),
          style: "primary",
        },
      ],
    });
  }

  const text = `${prefix}${input.title}${body ? ` — ${body}` : ""}`.slice(0, HEADER_MAX + BODY_MAX);
  return { text, blocks };
}

/* ── Bloques del bot conversacional / interactividad (Fase 2) ── */

/** Sección de texto `mrkdwn` (respuesta del asistente). */
export function assistantSection(mrkdwn: string): unknown {
  return { type: "section", text: { type: "mrkdwn", text: mrkdwn || "…" } };
}

/** Línea de contexto (etiqueta de la acción, vencimiento, etc.). */
export function contextLine(mrkdwn: string): unknown {
  return { type: "context", elements: [{ type: "mrkdwn", text: mrkdwn }] };
}

/** Botones Confirmar (primary) / Cancelar (danger) para una acción pendiente. */
export function confirmActionsBlock(pendingId: string): unknown {
  return {
    type: "actions",
    block_id: `opai_confirm_${pendingId}`,
    elements: [
      {
        type: "button",
        action_id: "pending_confirm",
        value: pendingId,
        style: "primary",
        text: { type: "plain_text", text: "Confirmar", emoji: true },
      },
      {
        type: "button",
        action_id: "pending_cancel",
        value: pendingId,
        style: "danger",
        text: { type: "plain_text", text: "Cancelar", emoji: true },
      },
    ],
  };
}

/**
 * Fila de gestión en la tarjeta de un ticket (Fase 7.1): Comentar · Estado ·
 * Aplazar/Pausar SLA · Silenciar. Cada botón abre el modal por-fila existente
 * (mismo `op` que la bandeja). `value = op:ticketId:code` (ids sin ':').
 */
export function ticketCardActionsBlock(ticketId: string, code: string): unknown {
  const ref = `${ticketId}:${code}`;
  const b = (op: string, text: string) => ({
    type: "button",
    // Slack exige action_id ÚNICO dentro del bloque actions; el op lo garantiza.
    action_id: `tcard_${op}`,
    value: `${op}:${ref}`,
    text: { type: "plain_text", text, emoji: true },
  });
  return {
    type: "actions",
    block_id: `opai_tcard_${ticketId}`,
    elements: [
      b("comment", "💬 Comentar"),
      b("status", "🔄 Estado"),
      b("aplazar", "⏳ Aplazar SLA"),
      b("pausar", "⏸ Pausar SLA"),
      b("silenciar", "🔕 Silenciar"),
    ],
  };
}

/**
 * Botones Aprobar / Rechazar en la TARJETA de una rendición o turno extra
 * (Fase 13). action_id ÚNICO por bloque (sufijo, lección aprendida); `value`
 * lleva `domain:pendingId` (dominio para gatear la capability al presionar).
 */
export function approvalCardActionsBlock(domain: "rendicion" | "te", pendingId: string): unknown {
  return {
    type: "actions",
    block_id: `opai_apcard_${pendingId}`,
    elements: [
      { type: "button", action_id: "apcard_approve", value: `${domain}:${pendingId}`, style: "primary", text: { type: "plain_text", text: "Aprobar", emoji: true } },
      { type: "button", action_id: "apcard_reject", value: `${domain}:${pendingId}`, style: "danger", text: { type: "plain_text", text: "Rechazar", emoji: true } },
    ],
  };
}

/** Botones Aprobar (primary) / Rechazar (danger) para un ticket. */
export function ticketActionsBlock(pendingId: string): unknown {
  return {
    type: "actions",
    block_id: `opai_ticket_${pendingId}`,
    elements: [
      {
        type: "button",
        action_id: "ticket_approve",
        value: pendingId,
        style: "primary",
        text: { type: "plain_text", text: "Aprobar", emoji: true },
      },
      {
        type: "button",
        action_id: "ticket_reject",
        value: pendingId,
        style: "danger",
        text: { type: "plain_text", text: "Rechazar", emoji: true },
      },
    ],
  };
}
