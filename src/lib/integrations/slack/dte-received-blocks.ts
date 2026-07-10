/**
 * Block Kit de "DTE recibido de proveedor" CON acciones de acuse SII y
 * asignación de centro de costo. Función pura: NO toca datos ni servicios.
 * Patrón clonado de bank-reconcile-blocks.ts. Formato de plata/fecha
 * reutilizado (NO reimplementado): `shortDate` + `formatCLP`.
 */

import { shortDate } from "@/lib/finance/bank-movements-summary";
import { formatCLP } from "@/lib/utils";

/** Alias local para leer igual que el resto de builders (`CLP(monto)`). */
const CLP = (n: number) => formatCLP(n);

export interface DteReceivedForBlocks {
  dteId: string;
  dteType: number; // 33=Factura, 34=Exenta, 61=N.Crédito...
  folio: number;
  issuerName: string;
  issuerRut: string;
  date: string; // ISO YYYY-MM-DD
  totalAmount: number; // CLP
  netAmount: number;
  taxAmount: number;
  receptionStatus: "PENDING_REVIEW" | "ACCEPTED" | "CLAIMED" | "PARTIAL_CLAIM";
  costCenterLabel?: string | null; // "Cliente · Instalación" si ya asignado
}

/** Umbral de layout: lotes gigantes se acusan mejor desde la web (Slack limita
 *  bloques/mensaje). Réplica del MAX_INLINE de bank-reconcile-blocks. */
export const MAX_INLINE = 12;

const pt = (t: string) => ({ type: "plain_text" as const, text: t.slice(0, 75), emoji: true });

export function dteTypeLabel(t: number): string {
  if (t === 34) return "Factura Exenta";
  if (t === 61) return "Nota de Crédito";
  if (t === 56) return "Nota de Débito";
  if (t === 39 || t === 41) return "Boleta";
  return "Factura";
}

/** block_ids estables por DTE — el handler los usa para reemplazar el grupo tras acusar. */
export const dteSecBlockId = (id: string) => `dterecv_sec_${id}`;
export const dteCtxBlockId = (id: string) => `dterecv_ctx_${id}`;
export const dteStateBlockId = (id: string) => `dterecv_state_${id}`;
export const dteActBlockId = (id: string) => `dterecv_act_${id}`;

const STATE_LABEL: Record<string, string> = {
  ACCEPTED: "✅ Aceptado",
  CLAIMED: "⛔ Reclamado",
  PARTIAL_CLAIM: "⚠️ Reclamo parcial",
};

/** Bloques de UN DTE (section + estado/centro de costo + actions). Todos con
 *  block_id estable para que `replaceDteInMessage` reemplace el grupo entero. */
export function renderDteBlocks(d: DteReceivedForBlocks): unknown[] {
  const tipo = dteTypeLabel(d.dteType);
  const line =
    `*${d.issuerName}*  ·  ${d.issuerRut}\n` +
    `${tipo} *F-${d.folio}*  ·  ${shortDate(d.date)}  ·  *${CLP(d.totalAmount)}*`;

  const blocks: unknown[] = [
    { type: "section", block_id: dteSecBlockId(d.dteId), text: { type: "mrkdwn", text: line } },
  ];

  const pending = d.receptionStatus === "PENDING_REVIEW";

  // Estado (solo si ya se acusó) → context propio con block_id estable.
  if (!pending) {
    blocks.push({
      type: "context",
      block_id: dteStateBlockId(d.dteId),
      elements: [{ type: "mrkdwn", text: STATE_LABEL[d.receptionStatus] ?? d.receptionStatus }],
    });
  }

  // Centro de costo.
  const ccText = d.costCenterLabel
    ? `↳ Centro de costo: *${d.costCenterLabel}*`
    : `↳ Sin centro de costo asignado`;
  blocks.push({
    type: "context",
    block_id: dteCtxBlockId(d.dteId),
    elements: [{ type: "mrkdwn", text: ccText }],
  });

  if (pending) {
    blocks.push({
      type: "actions",
      block_id: dteActBlockId(d.dteId),
      elements: [
        {
          type: "button", action_id: "dterecv_accept", style: "primary", text: pt("Aceptar"),
          value: d.dteId,
          confirm: {
            title: pt("Aceptar en el SII"),
            text: { type: "mrkdwn", text: "Aceptar habilita el uso del crédito IVA. *Es irreversible.*" },
            confirm: pt("Aceptar"), deny: pt("Cancelar"),
          },
        },
        { type: "button", action_id: "dterecv_claim_content", text: pt("Reclamar contenido"), value: d.dteId },
        { type: "button", action_id: "dterecv_claim_partial", text: pt("Falta parcial"), value: d.dteId },
        { type: "button", action_id: "dterecv_claim_total", style: "danger", text: pt("Falta total"), value: d.dteId },
        { type: "button", action_id: "dterecv_costcenter", text: pt("Asignar centro de costo"), value: d.dteId },
      ],
    });
  } else {
    blocks.push({
      type: "actions",
      block_id: dteActBlockId(d.dteId),
      elements: [
        { type: "button", action_id: "dterecv_costcenter", text: pt("Centro de costo"), value: d.dteId },
      ],
    });
  }
  return blocks;
}

/** Arma la tarjeta completa. Lotes > MAX_INLINE caen al layout resumido. */
export function buildDteReceivedBlocks(dtes: DteReceivedForBlocks[], summary: string): unknown[] {
  const blocks: unknown[] = [
    { type: "header", text: pt("📥 DTE recibido") },
    { type: "section", text: { type: "mrkdwn", text: summary } },
    { type: "divider" },
  ];

  if (dtes.length > MAX_INLINE) {
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `Son ${dtes.length} DTEs — acusalos y asigná centro de costo desde *Finanzas → Facturación → Recibidos* en OPAI.`,
      }],
    });
    return blocks;
  }

  for (const d of dtes) blocks.push(...renderDteBlocks(d));
  return blocks;
}

export function buildDteReceivedText(dtes: DteReceivedForBlocks[]): string {
  return dtes
    .map((d) => `${dteTypeLabel(d.dteType)} F-${d.folio} · ${d.issuerName} · ${CLP(d.totalAmount)}`)
    .join("\n");
}
