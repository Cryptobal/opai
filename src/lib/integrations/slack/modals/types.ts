/**
 * Tipos de la infraestructura de modales de Slack (Fase 5).
 *
 * Cada modal es un `ModalDef` con: gate de permiso (se chequea ANTES de abrir),
 * `build` (construye la view para views.open/update) y `submit` (valida el
 * view_submission y devuelve el ACK + trabajo pesado para after()).
 */

import type { RolePermissions } from "@/lib/permissions";
import type { ActiveWorkspace } from "../workspace";
import type { LinkedAdmin } from "../user-link";

/** Block Kit modal (view). */
export type SlackView = Record<string, unknown>;

/** Contexto al abrir un modal (shortcut / message_action / slash command). */
export interface ModalOpenContext {
  workspace: ActiveWorkspace;
  tenantId: string;
  linked: LinkedAdmin;
  slackUserId: string;
  channelId?: string;
  messageTs?: string;
  messageText?: string;
  /** Argumento libre del subcomando (`/opai negocio <texto>` → el texto). */
  arg?: string;
}

/** `view.state.values`: block_id → action_id → valor del input. */
export type ViewState = Record<
  string,
  Record<
    string,
    {
      value?: string;
      selected_option?: { value?: string };
      selected_date?: string;
      files?: Array<{ id?: string; url_private?: string; name?: string; mimetype?: string; size?: number }>;
    }
  >
>;

/**
 * `private_metadata` del modal: contexto, NO autoridad. El tenant SIEMPRE se
 * re-resuelve por `team_id` del payload; nunca se confía en `tenantHint`.
 */
export interface ModalMetadata {
  kind: string;
  channelId?: string;
  messageTs?: string;
  tenantHint?: string;
  // Estado de la bandeja de tickets / acciones por fila (Fase 7).
  ticketId?: string;
  status?: string;
  priority?: string;
  sla?: string;
  page?: string;
  approvals?: string;
  scope?: string; // alcance de la bandeja: mine | my_team | unassigned | all (Fase 11)
  // Bandeja de aprobaciones unificada (Fase 13): rechazo con motivo obligatorio.
  domain?: string; // ticket | rendicion | te
  entityId?: string; // id del ticket/rendición/TE a rechazar
  origin?: string; // inbox | card
  pendingId?: string; // SlackPendingAction (tarjeta) para actualizar el mensaje
  channelId2?: string; // canal del mensaje-tarjeta (origin=card)
  messageTs2?: string; // ts del mensaje-tarjeta (origin=card)
  // Cockpit comercial (Fase 15): bandejas de leads / pipeline / cotizaciones.
  leadId?: string;
  dealId?: string;
  quoteId?: string;
  source?: string; // filtro de origen de la bandeja de leads
  untaken?: string; // "1" = solo leads sin tomar
  qstatus?: string; // filtro de estado de la bandeja de cotizaciones
  stageId?: string; // etapa activa del drill de pipeline
  // Bandeja de documentos por vencer (Fase 18).
  docfilter?: string; // vencidos | semana | tramite | todos
  docInstallationId?: string; // filtro por instalación
  docRef?: string; // "<kind>:<id>" del documento en gestión (En trámite / Ya no aplica)
  // Buscador universal de negocios (Fase 21).
  q?: string; // texto buscado
  dscope?: string; // alcance: open | won | lost | all
}

export interface ModalSubmitContext {
  workspace: ActiveWorkspace;
  tenantId: string;
  linked: LinkedAdmin;
  slackUserId: string;
  metadata: ModalMetadata;
  state: ViewState;
}

/** ACK del view_submission + trabajo pesado opcional (corre en after()). */
export interface ModalSubmitResult {
  /** {} cierra · {response_action:"errors",errors} muestra errores por campo. */
  ack: Record<string, unknown>;
  work?: () => Promise<void>;
}

export interface ModalDef {
  callbackId: string;
  title: string;
  requires?: (perms: RolePermissions) => boolean;
  requiresMessage?: string;
  build: (ctx: ModalOpenContext) => Promise<SlackView> | SlackView;
  submit: (ctx: ModalSubmitContext) => Promise<ModalSubmitResult>;
}
