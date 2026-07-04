/**
 * Fila de acciones-cockpit en la TARJETA de `new_lead` (Fase 15, B1): los 5
 * minutos de oro. 👤 Tomar · 🟢 WhatsApp (URL, un toque) · 📅 Recordar 2h ·
 * ❌ Descartar. (✉️ Cotizar se agrega en B2.)
 *
 * action_id ÚNICO dentro del bloque (Slack lo exige); el `value` lleva el leadId.
 * El botón WhatsApp es de tipo URL (abre WhatsApp directo, ideal iPhone): Slack
 * no llama de vuelta al server en un botón URL, así que su clic no se loguea.
 */

export function leadCockpitActionsBlock(leadId: string, waUrl: string | null): unknown {
  const elements: unknown[] = [
    { type: "button", action_id: "leadcard_take", value: leadId, style: "primary", text: { type: "plain_text", text: "👤 Tomar", emoji: true } },
  ];
  if (waUrl) {
    elements.push({ type: "button", action_id: "leadcard_wa", url: waUrl, text: { type: "plain_text", text: "🟢 WhatsApp", emoji: true } });
  }
  elements.push(
    { type: "button", action_id: "leadcard_remind", value: leadId, text: { type: "plain_text", text: "📅 Recordar 2h", emoji: true } },
    { type: "button", action_id: "leadcard_discard", value: leadId, style: "danger", text: { type: "plain_text", text: "❌ Descartar", emoji: true } },
  );
  return { type: "actions", block_id: `opai_leadcard_${leadId}`, elements };
}
