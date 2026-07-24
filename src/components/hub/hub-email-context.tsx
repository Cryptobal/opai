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
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HubRecentEmails } from "@/modules/crm/email/hub-recent-emails";
import { useCorreosRealtime } from "@/components/crm/correos/useCorreosRealtime";

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
  const [realtimeChannel, setRealtimeChannel] = useState<string | null>(null);
  const lastSuccessAtRef = useRef(0);
  const requestRef = useRef(0);

  const load = useCallback((silent: boolean) => {
    if (!enabled) return;
    const requestId = ++requestRef.current;
    if (!silent) setStatus("loading");
    fetch("/api/hub/emails", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<
          HubRecentEmails & { realtimeChannel?: unknown }
        >;
      })
      .then((json) => {
        if (requestId !== requestRef.current) return;
        setData(json);
        setRealtimeChannel(
          typeof json.realtimeChannel === "string"
            ? json.realtimeChannel
            : null,
        );
        lastSuccessAtRef.current = Date.now();
        setStatus(json.connected ? "ready" : "disconnected");
      })
      .catch(() => {
        if (requestId !== requestRef.current || silent) return;
        setData(null);
        setStatus("error");
      });
  }, [enabled]);

  const reload = useCallback(() => {
    load(false);
  }, [load]);

  const refreshSilently = useCallback(() => {
    load(true);
  }, [load]);

  useEffect(() => {
    reload();
  }, [reload]);

  const realtimeStatus = useCorreosRealtime(
    realtimeChannel,
    refreshSilently,
  );

  useEffect(() => {
    if (!enabled) return;
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastSuccessAtRef.current < 30_000) return;
      refreshSilently();
    };
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("online", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    // Sin realtime se consulta cada 30 s. Incluso con canal vivo hacemos una
    // revalidación de seguridad cada 5 min por eventos perdidos/suspensión.
    const interval = window.setInterval(
      refreshSilently,
      realtimeStatus === "fallback" ? 30_000 : 5 * 60_000,
    );
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("online", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.clearInterval(interval);
    };
  }, [enabled, realtimeStatus, refreshSilently]);

  if (!enabled) return <>{children}</>;

  return (
    <HubEmailContext.Provider value={{ status, data, reload }}>
      {children}
    </HubEmailContext.Provider>
  );
}
