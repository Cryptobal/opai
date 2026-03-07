"use client";

import { useEffect, useRef, useState } from "react";
import type Pusher from "pusher-js";
import { getPusherClient, disconnectPusher } from "../lib/chat-pusher";

export type PusherConnectionState =
  | "initialized"
  | "connecting"
  | "connected"
  | "unavailable"
  | "failed"
  | "disconnected";

interface UsePusherReturn {
  pusher: Pusher | null;
  connectionState: PusherConnectionState;
}

/**
 * Hook that manages a Pusher connection lifecycle.
 * Creates the Pusher instance on mount, disconnects on unmount.
 * Returns both the Pusher instance and its connection state.
 */
export function usePusher(
  authEndpoint: string,
  authParams?: Record<string, string>
): UsePusherReturn {
  const pusherRef = useRef<Pusher | null>(null);
  const [connectionState, setConnectionState] =
    useState<PusherConnectionState>("initialized");

  useEffect(() => {
    const instance = getPusherClient(authEndpoint, authParams);
    pusherRef.current = instance;

    // Read the current state immediately
    setConnectionState(
      (instance.connection.state as PusherConnectionState) || "initialized"
    );

    // Listen for state changes
    const handleStateChange = ({
      current,
    }: {
      previous: string;
      current: string;
    }) => {
      setConnectionState(current as PusherConnectionState);
    };

    instance.connection.bind("state_change", handleStateChange);

    return () => {
      instance.connection.unbind("state_change", handleStateChange);
      disconnectPusher();
      pusherRef.current = null;
    };
    // We intentionally only run this once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pusher: pusherRef.current, connectionState };
}
