/**
 * Intents del lector: abrir panel de trabajo o composer desde atajos /
 * menú contextual sin acoplar CorreosClient al estado interno del drawer.
 */

import type { WorkTab } from "./work-panel-tabs";
import type { ComposerMode } from "./CorreoComposerBox";

export type ComposeIntent = {
  mode: ComposerMode;
  ai?: boolean;
  /**
   * Chips de intención: guía para generar el borrador con IA apenas abre el
   * composer (mismo flujo que el pill → `POST suggest-reply`).
   */
  instructions?: string;
  /** Cambia en cada pedido para re-disparar el effect aunque el modo sea igual. */
  nonce: number;
};

export type ReaderOpenOpts = {
  extract?: boolean;
  workTab?: WorkTab;
  compose?: Omit<ComposeIntent, "nonce">;
};

let intentNonce = 0;
export function nextIntentNonce(): number {
  intentNonce += 1;
  return intentNonce;
}
