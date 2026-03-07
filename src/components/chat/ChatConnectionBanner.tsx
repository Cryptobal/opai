"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Loader2, WifiOff } from "lucide-react";
import type { PusherConnectionState } from "./hooks/usePusher";

interface ChatConnectionBannerProps {
  connectionState: PusherConnectionState;
  onRetry?: () => void;
}

/**
 * Visual banner showing Pusher WebSocket connection state.
 * - connecting/disconnected: Yellow "Reconectando..." with spinner
 * - failed/unavailable: Red "Sin conexion" with retry button
 * - connected (after reconnection): Green "Conectado" auto-hides after 3s
 * - connected (initial): No banner
 */
export function ChatConnectionBanner({
  connectionState,
  onRetry,
}: ChatConnectionBannerProps) {
  const [visible, setVisible] = useState(false);
  const [showConnected, setShowConnected] = useState(false);
  const hasDisconnectedRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending hide timer on state change
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (
      connectionState === "connecting" ||
      connectionState === "disconnected" ||
      connectionState === "failed" ||
      connectionState === "unavailable"
    ) {
      // Mark that we have experienced a disconnection
      hasDisconnectedRef.current = true;
      setShowConnected(false);
      setVisible(true);
    } else if (connectionState === "connected") {
      if (hasDisconnectedRef.current) {
        // Show green "Conectado" banner briefly after reconnection
        setShowConnected(true);
        setVisible(true);
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
          // Reset after fade-out transition
          setTimeout(() => {
            setShowConnected(false);
            hasDisconnectedRef.current = false;
          }, 300);
        }, 3000);
      } else {
        // Initial connection — no banner
        setVisible(false);
      }
    } else {
      // "initialized" or unknown — no banner
      setVisible(false);
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [connectionState]);

  // Determine banner variant
  const isReconnecting =
    connectionState === "connecting" || connectionState === "disconnected";
  const isFailed =
    connectionState === "failed" || connectionState === "unavailable";
  const isConnected = showConnected && connectionState === "connected";

  // Don't render anything if there's nothing to show
  if (!visible && !isReconnecting && !isFailed && !isConnected) {
    return null;
  }

  let bannerClass: string;
  let content: React.ReactNode;

  if (isReconnecting) {
    bannerClass =
      "bg-yellow-900/40 border-b border-yellow-700/30 text-yellow-200";
    content = (
      <>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Reconectando...</span>
      </>
    );
  } else if (isFailed) {
    bannerClass = "bg-red-900/40 border-b border-red-700/30 text-red-200";
    content = (
      <>
        <WifiOff className="h-3 w-3" />
        <span>Sin conexion</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 rounded px-2 py-0.5 text-[10px] font-medium bg-red-800/60 hover:bg-red-700/60 text-red-100 transition-colors"
          >
            Reintentar
          </button>
        )}
      </>
    );
  } else if (isConnected) {
    bannerClass =
      "bg-emerald-900/40 border-b border-emerald-700/30 text-emerald-200";
    content = (
      <>
        <CheckCircle className="h-3 w-3" />
        <span>Conectado</span>
      </>
    );
  } else {
    return null;
  }

  return (
    <div
      className={`flex items-center justify-center gap-1.5 text-xs h-8 transition-opacity duration-300 ${bannerClass} ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {content}
    </div>
  );
}
