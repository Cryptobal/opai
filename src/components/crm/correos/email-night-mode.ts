"use client";

import { useSyncExternalStore } from "react";

/**
 * Preferencia global "fondo oscuro del correo" (toggle 🌙/☀️ del cuerpo).
 *
 * Antes vivía como `useState` local en cada `EmailHtmlBody`: se reiniciaba en
 * cada refresh y en cada re-render del hilo (parpadeo del lector), y no se
 * compartía entre mensajes ni entre móvil/desktop. Ahora es un store externo
 * persistido en `localStorage`: se conserva al refrescar la página, es el mismo
 * en móvil y desktop, y todos los cuerpos abiertos se sincronizan al alternarlo.
 */
const STORAGE_KEY = "opai.crm.correos.email-night.v1";

let cached: boolean | null = null;
const listeners = new Set<() => void>();
let storageBound = false;

function readStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Safari/modo privado puede bloquear storage: fondo claro por defecto.
    return false;
  }
}

function getSnapshot(): boolean {
  if (cached === null) cached = readStorage();
  return cached;
}

/** SSR/hidratación: fondo claro (evita mismatch; el cliente re-renderiza). */
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
