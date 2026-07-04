/**
 * Dispatch de los block_actions de la bandeja de documentos (Fase 18):
 *  - `docstray_open`     botón del digest en canal → abre la bandeja (views.open).
 *  - `docstray_scope_*`  chips de filtro → re-lista y views.update.
 *  - `docstray_f_inst`   filtro por instalación → views.update.
 *  - `docstray_page`     paginación → views.update.
 *  - `docstray_row`      select de gestión por fila → modal En trámite / Ya no aplica.
 * Aislamiento: tenant por team_id, identidad por vínculo, permiso módulo ops.
 */

import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView } from "../api";
import { hasModuleAccess } from "@/lib/permissions";
import { unpackMetadata } from "../modals/views";
import { openModalByCallback } from "../modals/dispatch";
import {
  buildDocsTrayView,
  loadDocsTray,
  parseDocsFilter,
  type DocsTrayFilter,
} from "./tray";

export async function handleDocsTrayAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const triggerId = payload.trigger_id as string | undefined;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const view = payload.view as { id?: string; private_metadata?: string } | undefined;
  const action = (
    payload.actions as Array<{ action_id?: string; value?: string; selected_option?: { value?: string } }> | undefined
  )?.[0];
  if (!teamId || !slackUserId || !action?.action_id) return;
  const actionId = action.action_id;

  // Botón del digest (mensaje de canal, sin modal en pila) → abre la bandeja.
  if (actionId === "docstray_open") {
    if (!triggerId) return;
    await openModalByCallback({
      teamId,
      triggerId,
      callbackId: "opai_documentos",
      slackUserId,
    });
    return;
  }

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !hasModuleAccess(linked.perms, "ops")) return;

  const meta = unpackMetadata(view?.private_metadata);
  const filter = parseDocsFilter(meta.docfilter);
  const installationId = meta.docInstallationId || undefined;
  const page = parseInt(meta.page || "1", 10) || 1;

  let nextFilter: DocsTrayFilter = filter;
  let nextInstallation = installationId;
  let nextPage = page;
  if (actionId.startsWith("docstray_scope_")) {
    nextFilter = parseDocsFilter(action.value);
    nextPage = 1;
  } else if (actionId === "docstray_f_inst") {
    const v = action.selected_option?.value ?? "";
    nextInstallation = v && v !== "__all" ? v : undefined;
    nextPage = 1;
  } else if (actionId === "docstray_page") {
    nextPage = action.value === "next" ? page + 1 : Math.max(1, page - 1);
  } else {
    return;
  }

  const data = await loadDocsTray(workspace.tenantId, nextFilter, nextInstallation, nextPage);
  if (view?.id) {
    await slackUpdateView(
      workspace.botToken,
      view.id,
      buildDocsTrayView(data, nextFilter, nextInstallation)
    );
  }
}
