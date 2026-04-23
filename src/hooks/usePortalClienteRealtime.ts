"use client";

import { useEffect, useRef } from "react";
import Pusher from "pusher-js";
import { usePortalSession } from "@/contexts/portal-cliente-session-context";

/**
 * Portal cliente realtime subscriber.
 *
 * Se suscribe al canal privado `private-portal-cliente-account-${accountId}`
 * (autorizado por `/api/portal/cliente/chat/pusher/auth`) y ejecuta los
 * handlers del consumidor cuando llegan eventos de rondas.
 *
 * Uso típico:
 *
 * ```ts
 * usePortalClienteRealtime({
 *   onRondaStarted: () => refetchRondas(),
 *   onRondaProgress: () => refetchRondas(),
 *   onRondaCompleted: () => { refetchRondas(); refetchSummary(); },
 * });
 * ```
 *
 * Notas:
 *   - Instancia Pusher por componente que lo use (pusher-js reusa la
 *     conexión subyacente vía su propio singleton interno si la key coincide).
 *   - Si no hay `NEXT_PUBLIC_PUSHER_KEY` configurado, el hook hace no-op.
 *   - Los eventos no traen datos sensibles: solo ids y flags para disparar
 *     refetch. La autoridad sigue siendo el backend.
 */
export type PortalClienteRealtimeHandlers = {
  onRondaStarted?: (payload: RealtimePayload) => void;
  onRondaProgress?: (payload: RealtimePayload) => void;
  onRondaCompleted?: (payload: RealtimePayload) => void;
  onAlerta?: (payload: RealtimePayload) => void;
};

export type RealtimePayload = {
  ejecucionId?: string | null;
  installationId?: string | null;
  [key: string]: unknown;
};

export function usePortalClienteRealtime(
  handlers: PortalClienteRealtimeHandlers,
): void {
  const { session } = usePortalSession();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!session?.accountId) return;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) {
      // Sin configuración Pusher, seguimos solo con fetch al montar.
      return;
    }

    const pusher = new Pusher(key, {
      cluster,
      authEndpoint: "/api/portal/cliente/chat/pusher/auth",
    });

    const channelName = `private-portal-cliente-account-${session.accountId}`;
    const channel = pusher.subscribe(channelName);

    const onStarted = (data: RealtimePayload) =>
      handlersRef.current.onRondaStarted?.(data ?? {});
    const onProgress = (data: RealtimePayload) =>
      handlersRef.current.onRondaProgress?.(data ?? {});
    const onCompleted = (data: RealtimePayload) =>
      handlersRef.current.onRondaCompleted?.(data ?? {});
    const onAlerta = (data: RealtimePayload) =>
      handlersRef.current.onAlerta?.(data ?? {});

    channel.bind("ronda-started", onStarted);
    channel.bind("ronda-progress", onProgress);
    channel.bind("ronda-completed", onCompleted);
    channel.bind("alerta", onAlerta);

    return () => {
      channel.unbind("ronda-started", onStarted);
      channel.unbind("ronda-progress", onProgress);
      channel.unbind("ronda-completed", onCompleted);
      channel.unbind("alerta", onAlerta);
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [session?.accountId]);
}
