"use client";

import { useSyncExternalStore } from "react";

/**
 * Preferencia global "fondo oscuro del correo" (toggle 🌙/☀️ del cuerpo).
 *
 * Persistida en `localStorage` y compartida entre mensajes / móvil / desktop.
 * Default: noche (`true`) cuando no hay valor o el storage falla. Solo `"0"`
 * explícito fuerza fondo claro. El consumidor (`EmailHtmlBody`) acopla esta
 * preferencia al tema de la app: en tema claro el cuerpo es siempre blanco
 * y el toggle no se muestra; en oscuro aplica `preferenciaNoche`.
 */
const STORAGE_KEY = "opai.crm.correos.email-night.v1";

let cached: boolean | null = null;
const listeners = new Set<() => void>();
let storageBound = false;

function readStorage(): boolean {
  try {
    // Solo `"0"` explícito = claro; ausencia / `"1"` / otro = noche.
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    // Safari/modo privado puede bloquear storage: noche por defecto.
    return true;
  }
}

function getSnapshot(): boolean {
  if (cached === null) cached = readStorage();
  return cached;
}

/** SSR/hidratación: noche (evita mismatch; el cliente re-renderiza si hay "0"). */
function getServerSnapshot(): boolean {
  return true;
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
