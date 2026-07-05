/**
 * ModalDef y block_actions del buscador de cuentas (Fase 1). Cierra el molde
 * clonado de `deal-search.ts`: gate en Cuentas (CRM), submit que valida la
 * query, y el handler `acct_*` que abre el buscador de negocios pre-filtrado
 * por la cuenta ("💼 Ver negocios"). Los botones 🔗/🟢 son links (sin handler).
 */

import { canView, canEdit } from "@/lib/permissions";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackPushView } from "../api";
import { accountSearchView } from "./account-search-view";
import { dealSearchView } from "./deal-search";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult } from "../modals/types";

/** Dispatch de block_actions del buscador de cuentas (prefijo `acct_`). */
export async function handleAccountSearchAction(payload: {
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  // Solo "💼 Ver negocios" necesita servidor; 🔗 Abrir cliente y 🟢 WhatsApp son URL.
  if (!teamId || !slackUserId || action?.action_id !== "acct_deals") return;
  const triggerId = payload.trigger_id;
  if (!triggerId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !canView(linked.perms, "crm", "deals")) return;

  const name = (action.value ?? "").trim();
  try {
    const view = await dealSearchView(workspace.tenantId, workspace.slackTeamId, canEdit(linked.perms, "crm", "deals"), name, "open");
    await slackPushView(workspace.botToken, triggerId, view);
  } catch (err) {
    console.error("[slack] accountSearch: abrir buscador de negocios falló:", err);
  }
}

export const accountSearchModal: ModalDef = {
  callbackId: "opai_cuenta",
  title: "Buscar cliente",
  requires: (perms) => canView(perms, "crm", "accounts"),
  requiresMessage: "Necesitas acceso a Cuentas (CRM).",
  build: async (ctx: ModalOpenContext) => accountSearchView(ctx.tenantId, (ctx.arg ?? "").trim()),
  submit: async (ctx: ModalSubmitContext): Promise<ModalSubmitResult> => {
    const q = (ctx.state.q?.v?.value ?? "").trim();
    if (!q) return { ack: { response_action: "errors", errors: { q: "Escribe algo para buscar." } } };
    const view = await accountSearchView(ctx.tenantId, q);
    return { ack: { response_action: "update", view } };
  },
};
