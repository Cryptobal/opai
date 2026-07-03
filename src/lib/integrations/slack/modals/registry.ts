/**
 * Registro de modales de Slack. Agregar un modal = importarlo y sumarlo a
 * `MODALS`; el dispatch (abrir + view_submission) lo enruta por `callbackId`
 * sin más código. Los modales concretos se registran en los Bloques 5 y 6.
 */

import type { ModalDef } from "./types";

const MODALS: ModalDef[] = [];

export function getModal(callbackId: string): ModalDef | undefined {
  return MODALS.find((m) => m.callbackId === callbackId);
}
