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
}

const HEADER_MAX = 150;
const BODY_MAX = 2900;

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
