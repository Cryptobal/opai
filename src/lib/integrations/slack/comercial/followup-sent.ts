/**
 * 📨 Seguimiento de propuesta enviado: cuando el cron de follow-ups manda un
 * email de seguimiento a un cliente (1er / 2do / último), se emite
 * `followup_sent` enriquecido con contacto, empresa, qué se mandó (asunto +
 * secuencia) y el link `wa.me` ya templado en el emisor.
 *
 * El emisor vive en `src/lib/process-followup-log.ts`; la tarjeta especial y su
 * botón de WhatsApp se arman acá y se enchufan en dispatch.ts (rama por-key).
 */

/** Campos curados de la tarjeta 📨 (evita el ruido del renderer genérico). */
export function followupSentFields(
  data?: Record<string, unknown> | null,
): Array<{ label: string; value: string }> {
  if (!data) return [];
  const out: Array<{ label: string; value: string }> = [];
  if (typeof data.empresa === "string" && data.empresa)
    out.push({ label: "Cliente", value: data.empresa });
  if (typeof data.contacto === "string" && data.contacto)
    out.push({ label: "Contacto", value: data.contacto });
  const seq = data.secuencia;
  if (typeof seq === "number")
    out.push({
      label: "Envío",
      value: seq === 1 ? "1er seguimiento" : seq === 2 ? "2do seguimiento" : "Último seguimiento",
    });
  if (typeof data.proposalSentDate === "string" && data.proposalSentDate)
    out.push({ label: "Propuesta del", value: data.proposalSentDate });
  return out;
}

/** Fila de acciones de la tarjeta 📨: WhatsApp para contactar (link ya templado). */
export function followupSentActionsBlock(dealId: string, waUrl: string | null): unknown | null {
  if (!waUrl) return null;
  return {
    type: "actions",
    block_id: `opai_followupsent_${dealId}`,
    elements: [
      {
        type: "button",
        action_id: "followupsent_wa",
        url: waUrl,
        style: "primary",
        text: { type: "plain_text", text: "🟢 WhatsApp", emoji: true },
      },
    ],
  };
}
