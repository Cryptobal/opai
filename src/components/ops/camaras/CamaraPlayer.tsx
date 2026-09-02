"use client";

import { cn } from "@/lib/utils";
import { useRelayStream } from "./useRelayStream";

type Props = {
  src: string | null;
  token: string | null;
  relayUrl: string | null;
  enabled: boolean;
  onUnauthorized?: () => void;
  className?: string;
  poster?: string;
};

export function CamaraPlayer({
  src, token, relayUrl, enabled, onUnauthorized, className, poster,
}: Props) {
  const { videoRef, mode, error } = useRelayStream({
    src, token, relayUrl, enabled, onUnauthorized,
  });

  return (
    <div className={cn("relative overflow-hidden bg-ds-surface-2", className)}>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        muted
        autoPlay
        playsInline
        poster={poster}
      />
      {mode === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-ds-text-3">
          Conectando…
        </div>
      )}
      {mode === "error" && (
        <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[13px] text-status-danger-fg">
          {error === "401" || error?.includes("401")
            ? "No disponible"
            : "Relay no disponible"}
        </div>
      )}
      {mode === "mse" && (
        <span className="absolute bottom-1 right-1 rounded bg-ds-surface-3/80 px-1.5 py-0.5 text-[12px] text-ds-text-3">
          MSE
        </span>
      )}
    </div>
  );
}
