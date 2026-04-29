"use client";

import { useEffect, useRef } from "react";
import type Pusher from "pusher-js";
import { getPusherClient, disconnectPusher } from "../lib/chat-pusher";

/**
 * Hook that manages a Pusher connection lifecycle.
 * Creates the Pusher instance on mount, disconnects on unmount.
 */
export function usePusher(
  authEndpoint: string,
  authParams?: Record<string, string>
): Pusher | null {
  const pusherRef = useRef<Pusher | null>(null);

  useEffect(() => {
    const instance = getPusherClient(authEndpoint, authParams);
    pusherRef.current = instance ?? null;

    return () => {
      disconnectPusher();
      pusherRef.current = null;
    };
    // We intentionally only run this once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return pusherRef.current;
}
