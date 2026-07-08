/**
 * Resumen de la cotización para la sala del negocio (Deal Room).
 *
 * Al abrir la sala (o al pedir "Actualizar sala") se publica un mensaje rico con
 * lo cotizado: cliente, ubicación/instalación, dotación, puestos + horarios,
 * cargo y **sueldo líquido**, monto mensual, modalidad (continuo/plazo) y links.
 * Reutiliza `loadStartCanvasData` como fuente única (el mismo loader del canvas),
 * pero renderiza BLOQUES de Slack (no markdown de canvas). Renderer puro + poster.
 */

import "server-only";
import { clp } from "../comercial/deal-common";
import { formatWeekdaysShort } from "@/lib/cpq/weekdays";
import { getWorkspaceForTenant, type ActiveWorkspace } from "../workspace";
import { slackPostMessage } from "../api";
import { loadStartCanvasData, type StartCanvasData } from "./start-canvas-data";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

/** Fecha larga es-CL en UTC (evita drift con campos @db.Date). */
function longDate(d: Date): string {
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Construye los bloques del resumen de cotización a partir de los datos ya
 * cargados. Puro (sin I/O) para poder testear sin Slack.
 */
export function buildQuoteResumenBlocks(data: StartCanvasData): { text: string; blocks: unknown[] } {
  const modalidad = data.isOngoingService
    ? "🔁 Servicio continuo (indefinido)"
    : `⏳ Plazo definido · ${data.contractDurationMonths ?? 0} ${data.contractDurationMonths === 1 ? "mes" : "meses"}${
        data.serviceEndDate ? ` · termina el ${longDate(data.serviceEndDate)}` : ""
      }`;

  const fields: Array<{ label: string; value: string }> = [
    { label: "Cliente", value: data.accountName },
    { label: "Monto mensual", value: data.monthlyAmount ? `${clp(data.monthlyAmount)} + IVA` : "—" },
    {
      label: "Dotación",
      value: `${data.totalGuards} ${data.totalGuards === 1 ? "guardia" : "guardias"} · ${data.positions.length} ${
        data.positions.length === 1 ? "puesto" : "puestos"
      }`,
    },
    { label: "Modalidad", value: modalidad },
  ];

  const blocks: unknown[] = [
    { type: "header", text: pt(`📋 Resumen de la cotización — ${data.title}`.slice(0, 150)) },
    { type: "section", fields: fields.map((f) => ({ type: "mrkdwn", text: `*${f.label}*\n${f.value}` })) },
  ];

  // Puestos y horarios.
  if (data.positions.length) {
    const horarios = data.positions
      .map((p, i) => `*P${i + 1}* · ${p.name} — ${formatWeekdaysShort(p.weekdays)} ${p.startTime || "—"}–${p.endTime || "—"} · ${p.numGuards} ${p.numGuards === 1 ? "guardia" : "guardias"}`)
      .join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*🧍 Puestos y horarios*\n${horarios}`.slice(0, 2900) } });
  }

  // Cargos y sueldo líquido.
  if (data.cargoSueldo.length) {
    const sueldos = data.cargoSueldo
      .map((cs) => {
        const liquido = cs.netSalary != null ? `${clp(cs.netSalary)} líquido` : "sueldo líquido s/i";
        return `• *${cs.cargo}* — ${liquido} (base ${clp(cs.baseSalary)})`;
      })
      .join("\n");
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*💵 Cargos y sueldo*\n${sueldos}`.slice(0, 2900) } });
  }

  // Ubicación de la instalación.
  if (data.addressText) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*📍 Ubicación*\n${data.addressText}`.slice(0, 2900) } });
  }

  // Acciones: cómo llegar + ver cotización (botones url, sin handler).
  const actions: unknown[] = [];
  if (data.mapsUrl) actions.push({ type: "button", action_id: "quoteres_maps", url: data.mapsUrl, text: pt("🗺️ Cómo llegar") });
  if (data.quoteUrl) actions.push({ type: "button", action_id: "quoteres_quote", url: data.quoteUrl, text: pt("📄 Ver cotización") });
  actions.push({ type: "button", action_id: "quoteres_deal", url: data.opaiDealUrl, text: pt("Abrir negocio en OPAI") });
  blocks.push({ type: "actions", block_id: `quote_resumen_${data.dealId}`, elements: actions });

  // Contacto de referencia.
  if (data.contact) {
    const c = [data.contact.name, data.contact.phone, data.contact.email].filter(Boolean).join(" · ");
    if (c) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `👤 ${c}` }] });
  }

  const text = `📋 Resumen de la cotización — ${data.title} · ${data.accountName}`;
  return { text: text.slice(0, 300), blocks };
}

/**
 * Carga los datos y publica el resumen de la cotización en el canal del negocio.
 * Best-effort: nunca lanza; devuelve el `ts` del mensaje o null. `ws`/`channelId`
 * se pueden inyectar (openDealRoom ya los tiene) para evitar recargas.
 */
export async function postQuoteResumenToRoom(
  tenantId: string,
  dealId: string,
  opts: { ws?: ActiveWorkspace; channelId: string },
): Promise<string | null> {
  try {
    const ws = opts.ws ?? (await getWorkspaceForTenant(tenantId));
    if (!ws) return null;
    const data = await loadStartCanvasData(tenantId, dealId);
    if (!data) return null;
    const { text, blocks } = buildQuoteResumenBlocks(data);
    const { ts } = await slackPostMessage(ws.botToken, { channel: opts.channelId, text, blocks });
    return ts || null;
  } catch (e) {
    console.error("[slack] postQuoteResumenToRoom falló:", e);
    return null;
  }
}
