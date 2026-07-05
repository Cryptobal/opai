/**
 * Vista del buscador de cuentas en Slack (Fase 1). Input + ficha accionable por
 * cuenta. Clona el molde de `deal-search.ts` (shell + resultRowBlocks) pero sin
 * chips de alcance: una cuenta no tiene estados como un negocio.
 *
 * Cada fila: `*Cuenta* · RUT` + `📍 N inst · 💼 M negocios ($X) · 🧾 última cot ·
 * 💰 pago` con 🔗 Abrir cliente (/crm/accounts/{id}) · 🟢 WhatsApp (si hay
 * teléfono) · 💼 Ver negocios (abre el buscador de negocios pre-filtrado).
 * Null-safety total: una fila corrupta se salta con log.
 */

import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { normalizePhone } from "@/lib/psych/normalizePhone";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import { clp } from "./deal-common";
import { lastInteractionLabels } from "@/lib/crm/interaction-history";
import { searchAccounts, type FoundAccount } from "./account-search";
import type { SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

const accountOpaiUrl = (accountId: string): string => `${getCanonicalSiteUrl()}/crm/accounts/${accountId}`;

const QUOTE_STATUS_ES: Record<string, string> = {
  draft: "borrador",
  sent: "enviada",
  viewed: "vista",
  accepted: "aceptada",
  rejected: "rechazada",
  expired: "vencida",
};

/** Etiqueta de la última cotización, o null si no hay. */
function quoteLabel(a: FoundAccount): string | null {
  if (!a.lastQuoteCode) return null;
  const st = a.lastQuoteStatus ? QUOTE_STATUS_ES[a.lastQuoteStatus] ?? a.lastQuoteStatus : null;
  return `${a.lastQuoteCode}${st ? ` (${st})` : ""}`;
}

/** Etiqueta de estado de pago: "—" si no se pudo calcular, "al día" o "N impago(s)". */
function paymentLabel(a: FoundAccount): string {
  if (a.unpaidCount === null) return "—";
  if (a.unpaidCount === 0) return "al día";
  return `${a.unpaidCount} impago${a.unpaidCount === 1 ? "" : "s"} (${clp(a.unpaidAmount)})`;
}

/** Bloques de UNA fila de resultado de cuenta. */
function resultRowBlocks(a: FoundAccount, lastInteraction?: string): unknown[] {
  const quote = quoteLabel(a);
  const metrics = [
    `📍 ${a.activeInstallations} inst`,
    `💼 ${a.openDealsCount} negocio${a.openDealsCount === 1 ? "" : "s"}${a.openDealsCount > 0 ? ` (${clp(a.openDealsAmount)})` : ""}`,
    `🧾 ${quote ?? "sin cotización"}`,
    `💰 ${paymentLabel(a)}`,
  ].join(" · ");
  const title = `*${a.name}*${a.rut ? ` · ${a.rut}` : ""}`;
  const contact = a.contactName ? `\n👤 ${a.contactName}${a.contactPhone ? ` · ${a.contactPhone}` : ""}` : "";
  const inter = lastInteraction ? `\n_última interacción: ${lastInteraction}_` : "";
  const section = { type: "section", text: { type: "mrkdwn", text: `${title}\n${metrics}${contact}${inter}` } };

  const btns: unknown[] = [
    { type: "button", action_id: "acct_open", url: accountOpaiUrl(a.id), text: pt("🔗 Abrir cliente") },
    { type: "button", action_id: "acct_deals", value: a.name.slice(0, 200), text: pt("💼 Ver negocios") },
  ];
  const norm = a.contactPhone ? normalizePhone(a.contactPhone) : null;
  if (norm?.ok) btns.push({ type: "button", action_id: "acct_wa", url: `https://wa.me/${norm.digits}`, text: pt("🟢 WhatsApp") });
  return [section, { type: "actions", block_id: `opai_acct_${a.id}`, elements: btns }];
}

function searchModalShell(q: string, blocks: unknown[]): SlackView {
  return {
    type: "modal",
    callback_id: "opai_cuenta",
    private_metadata: packMetadata({ kind: "account_search", q: q.slice(0, 200) }),
    title: modalTitle("Buscar cliente"),
    submit: pt("Buscar"),
    close: pt("Cerrar"),
    blocks,
  };
}

/**
 * Vista completa del buscador de cuentas: input + resultados. `q` vacío =
 * pantalla inicial con hint. Reutilizada por build, submit y block_actions.
 */
export async function accountSearchView(tenantId: string, q: string, notice?: string): Promise<SlackView> {
  const blocks: unknown[] = [
    {
      type: "input",
      block_id: "q",
      label: pt("Cliente, RUT o instalación"),
      element: {
        type: "plain_text_input",
        action_id: "v",
        placeholder: pt("ej: polpaico"),
        max_length: 80,
        ...(q ? { initial_value: q.slice(0, 80) } : {}),
      },
    },
    { type: "divider" },
  ];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });

  if (!q.trim()) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Escribe parte del nombre del cliente (o su RUT) y presiona *Buscar*." }] });
    return searchModalShell(q, blocks);
  }

  let accounts: FoundAccount[] = [];
  try {
    accounts = await searchAccounts(tenantId, q.trim(), 8);
  } catch (err) {
    console.error(`[slack] accountSearch: búsqueda falló q="${q}":`, err);
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "⚠️ La búsqueda falló. Intenta de nuevo." } });
    return searchModalShell(q, blocks);
  }
  if (!accounts.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `Sin resultados para *${q.trim().slice(0, 60)}*. Prueba con parte del nombre o el RUT.` } });
  } else {
    const interactions = await lastInteractionLabels(tenantId, "account", accounts.map((a) => a.id));
    for (const a of accounts) {
      // Blindaje por fila: una fila corrupta se salta con log (regla Fase 1).
      try {
        blocks.push(...resultRowBlocks(a, interactions.get(a.id)));
      } catch (err) {
        console.error(`[slack] accountSearch: fila corrupta accountId=${a.id}:`, err);
      }
    }
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `${accounts.length} resultado(s) · máx 8` }] });
  }
  return searchModalShell(q, blocks);
}
