"use client";

import { useEffect } from "react";
import { subscribeHideKeyboardAccessoryBar } from "./hideKeyboardAccessoryBar";

/**
 * Mantiene oculta la barra accesoria de iOS (◀ ▶ + ✓) en TODA la app, no solo
 * en el composer de Correos: cualquier input (búsqueda, formularios, sheets)
 * la reactiva al enfocar y hay que re-ocultarla en cada `keyboardWillShow`.
 *
 * No-op fuera de Capacitor iOS (el helper corta por plataforma). Los
 * `subscribe` locales de las superficies siguen vigentes y son idempotentes.
 */
export function NativeKeyboardSetup() {
  useEffect(() => subscribeHideKeyboardAccessoryBar(), []);
  return null;
}
