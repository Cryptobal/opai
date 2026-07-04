/**
 * Registro declarativo de acciones rápidas de OPAI en Slack (Fase 7).
 *
 * Una acción es un `ModalDef` (build + submit + gate `requires`) con metadata de
 * `group` para agruparla en el hub. El hub, `/opai <accion>` y los shortcuts
 * consumen ESTE registro: agregar una acción = agregar una entrada acá.
 *
 * Los modales de Fase 5 (crear ticket, rendición) se migran sin cambios de
 * comportamiento — solo se les añade el grupo.
 */

import type { ModalDef } from "../modals/types";
import { ticketModal } from "../modals/ticket";
import { rendicionModal } from "../modals/rendicion";
import { misRendicionesModal } from "../modals/mis-rendiciones";
import { trayModal } from "../tickets/tray";
import { visitaModal } from "./visita";
import { turnoExtraModal } from "./turno-extra";
import { vacacionesModal } from "./vacaciones";

export interface ActionDef extends ModalDef {
  /** Grupo visible en el hub (p. ej. "Tickets", "Operaciones", "Finanzas"). */
  group: string;
}

export const ACTIONS: ActionDef[] = [
  // "Mis tickets" reusa la bandeja existente (opai_tickets); el botón Abrir la
  // apila vía opai_action_open → getModal, sin duplicar el builder.
  { ...trayModal, group: "Tickets" },
  { ...ticketModal, group: "Tickets" },
  { ...visitaModal, group: "Operaciones" },
  { ...turnoExtraModal, group: "Operaciones" },
  { ...vacacionesModal, group: "RRHH" },
  { ...rendicionModal, group: "Finanzas" },
  { ...misRendicionesModal, group: "Finanzas" },
];

export function getAction(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.callbackId === id);
}
