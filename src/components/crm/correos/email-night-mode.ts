"use client";

import { useSyncExternalStore } from "react";

/**
 * Preferencia global "fondo oscuro del correo" (toggle 🌙/☀️ del cuerpo).
 *
 * Persistida en `localStorage` y compartida entre mensajes / móvil / desktop.
 * Default: claro (`false`) — los HTML de correo (logos, newsletters) asumen
 * fondo blanco, igual que Gmail. Solo `"1"` explícito activa noche. El
 * consumidor (`EmailHtmlBody`) acopla esta preferencia al tema de la app: en
 * tema claro el cuerpo es siempre blanco y el toggle no se muestra; en oscuro
 * aplica `preferenciaNoche`.
 */
const STORAGE_KEY = "opai.crm.correos.email-night.v1";

let cached: boolean | null = null;
const listeners = new Set<() => void>();
let storageBound = false;

function readStorage(): boolean {
  try {
    // Solo `"1"` explícito = noche; ausencia / `"0"` = claro (fidelidad).
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getSnapshot(): boolean {
  if (cached === null) cached = readStorage();
  return cached;
}

/** SSR/hidratación: claro (evita mismatch; el cliente re-renderiza si hay "1"). */
function getServerSnapshot(): boolean {
  return false;
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  // Sincroniza entre pestañas: otra pestaña que cambie la preferencia dispara
  // un `storage` event que refresca el valor cacheado y notifica.
  if (!storageBound && typeof window !== "undefined") {
    storageBound = true;
    window.addEventListener("storage", (e) => {
      if (e.key !== STORAGE_KEY) return;
      cached = readStorage();
      notify();
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setEmailNightMode(value: boolean): void {
  cached = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage bloqueado: el toggle sigue operando en memoria durante la sesión.
  }
  notify();
}

/** Preferencia reactiva del fondo oscuro del correo (persistente y compartida). */
export function useEmailNightMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
