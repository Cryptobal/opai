"use client";

/**
 * Contexto de correos recientes del Hub — UNA sola llamada a
 * /api/hub/emails compartida entre `RecentEmailCard` (lista) y
 * `HubQuickActions` (badge de no leídos), sin consultas duplicadas.
 *
 * El fetch es de solo lectura: cargar la tarjeta jamás marca mensajes
 * como leídos. Un fallo aquí queda contenido (estado `error`) y no
 * afecta al resto del Hub.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { HubRecentEmails } from "@/modules/crm/email/hub-recent-emails";

export type HubEmailStatus = "loading" | "ready" | "disconnected" | "error";

export interface HubEmailState {
  status: HubEmailStatus;
  data: HubRecentEmails | null;
  reload: () => void;
}

const HubEmailContext = createContext<HubEmailState | null>(null);

/** null-safe: consumidores fuera del provider reciben null (sin badge). */
export function useHubEmails(): HubEmailState | null {
  return useContext(HubEmailContext);
}

export function HubEmailProvider({
  enabled = true,
  children,
}: {
  /** false cuando el usuario no tiene acceso CRM — no se hace fetch. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<HubEmailStatus>("loading");
  const [data, setData] = useState<HubRecentEmails | null>(null);

  const reload = useCallback(() => {
    if (!enabled) return;
    setStatus("loading");
    fetch("/api/hub/emails")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HubRecentEmails>;
      })
      .then((json) => {
        setData(json);
        setStatus(json.connected ? "ready" : "disconnected");
      })
      .catch(() => {
        setData(null);
        setStatus("error");
      });
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!enabled) return <>{children}</>;

  return (
    <HubEmailContext.Provider value={{ status, data, reload }}>
      {children}
    </HubEmailContext.Provider>
  );
}
