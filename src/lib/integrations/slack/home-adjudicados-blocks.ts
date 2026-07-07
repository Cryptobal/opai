/**
 * Render de la sección "🏁 Adjudicados por iniciar" de la App Home: negocios
 * ganados (etapa `isAccepted`) aún sin arrancar, ordenados por fecha de inicio
 * con countdown. Los datos llegan del helper `comercial/adjudicados.ts` ya
 * filtrados por alcance (ops → todos · comercial → los suyos). Solo render aquí.
 */

import type { AdjudicadoDeal } from "./comercial/adjudicados";
import { clp } from "./comercial/deal-common";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

const pt = (text: string) => ({ type: "plain_text", text, emoji: true });

const MS_DAY = 86_400_000;

/** Días calendario (medianoche local) entre hoy y `d`. Negativo = ya pasó. */
function daysUntil(d: Date): number {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / MS_DAY);
}

/**
 * Countdown textual al inicio del servicio. Slack no tiene color por elemento,
 * así que la urgencia va como prefijo: 🔴 ≤7d · 🟠 ≤21d · sin prefijo si más.
 */
function countdownLabel(start: Date | null): string {
  if (!start || Number.isNaN(start.getTime())) return "🚀 sin fecha";
  const dl = daysUntil(start);
  const rel =
    dl < 0 ? `inició hace ${-dl} ${-dl === 1 ? "día" : "días"}`
      : dl === 0 ? "hoy"
        : dl === 1 ? "mañana"
          : `en ${dl} días`;
  const prefix = dl <= 7 ? "🔴 " : dl <= 21 ? "🟠 " : "";
  return `${prefix}${rel}`;
}

/** Fila de un adjudicado: cuenta + negocio, countdown · monto, botón "Abrir". */
function adjudicadoRow(d: AdjudicadoDeal): unknown[] {
  const account = (d.accountName || "Cliente").trim() || "Cliente";
  const title = (d.title || "Negocio").trim() || "Negocio";
  const meta = [countdownLabel(d.serviceStartDate), d.amount ? clp(d.amount) : null]
    .filter(Boolean)
    .join("  ·  ");
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${account}*\n${title}` },
      accessory: {
        type: "button",
        action_id: "home_adjudicado_open",
        url: `${getCanonicalSiteUrl()}/crm/deals/${d.id}`,
        text: pt("Abrir →"),
      },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: meta }] },
  ];
}

/**
 * Bloques de la sección completa (divider + encabezado con conteo + filas).
 * Devuelve `[]` si no hay adjudicados (el caller ya lo evita, defensa doble).
 */
export function adjudicadosSectionBlocks(deals: AdjudicadoDeal[]): unknown[] {
  if (!deals.length) return [];
  const blocks: unknown[] = [
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*🏁 Adjudicados por iniciar* · ${deals.length}` } },
  ];
  for (const d of deals) blocks.push(...adjudicadoRow(d));
  return blocks;
}
