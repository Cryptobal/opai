/**
 * Registro declarativo de acciones rápidas de OPAI en Slack (Fase 7 · F20).
 *
 * Una acción es un `ModalDef` (build + submit + gate `requires`) con metadata de
 * `group` para agruparla en el hub y `emoji` para el botón (el texto del botón
 * ES la acción — nunca un "Abrir" genérico). El hub, `/opai <accion>` y los
 * shortcuts consumen ESTE registro: agregar una acción = agregar una entrada acá.
 *
 * Semántica (F20): "Solicitud de vacaciones" NO es una acción propia — es un
 * TIPO de ticket (`solicitud_vacaciones`) y vive dentro de "Nuevo ticket" (su
 * selector de tipos lista los tipos activos con origen internal/both).
 */

import type { ModalDef } from "../modals/types";
import { ticketModal } from "../modals/ticket";
import { rendicionModal } from "../modals/rendicion";
import { misRendicionesModal } from "../modals/mis-rendiciones";
import { trayModal } from "../tickets/tray";
import { visitaModal } from "./visita";
import { turnoExtraModal } from "./turno-extra";
import { dealSearchModal } from "../comercial/deal-search";

export interface ActionDef extends ModalDef {
  /** Grupo visible en el hub (p. ej. "Tickets", "Operaciones", "Finanzas"). */
  group: string;
  /** Emoji del botón en el hub (el label es `${emoji} ${title}`). */
  emoji: string;
}

export const ACTIONS: ActionDef[] = [
  // "Mis tickets" reusa la bandeja existente (opai_tickets); el botón del hub la
  // apila vía opai_action_open → getModal, sin duplicar el builder.
  { ...trayModal, group: "Tickets", emoji: "🎫" },
  { ...ticketModal, group: "Tickets", emoji: "➕" },
  { ...visitaModal, group: "Operaciones", emoji: "📍" },
  { ...turnoExtraModal, group: "Operaciones", emoji: "⏱" },
  { ...rendicionModal, group: "Finanzas", emoji: "🧾" },
  { ...misRendicionesModal, group: "Finanzas", emoji: "📄" },
  // Comercial (F21): buscador universal de negocios (gate: ver Negocios CRM).
  { ...dealSearchModal, group: "Comercial", emoji: "🔎" },
];

export function getAction(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.callbackId === id);
}
