/**
 * Resolución de modales por `callbackId` para el dispatch (abrir + view_submission).
 * La fuente es el registro de acciones (`actions/registry.ts`) más el hub y las
 * bandejas que no son "acciones de creación".
 */

import type { ModalDef } from "./types";
import { ACTIONS } from "../actions/registry";
import { hubModal } from "../actions/hub";
import { trayModal, trayOverdueModal } from "../tickets/tray";
import { rowModals } from "../tickets/row-submit";
import { inboxModal } from "../approvals/inbox";
import { rejectReasonModal } from "../approvals/reason-modal";
import { misRendicionesModal } from "./mis-rendiciones";

const MODALS: ModalDef[] = [hubModal, trayModal, trayOverdueModal, inboxModal, rejectReasonModal, misRendicionesModal, ...rowModals, ...ACTIONS];

export function getModal(callbackId: string): ModalDef | undefined {
  return MODALS.find((m) => m.callbackId === callbackId);
}
