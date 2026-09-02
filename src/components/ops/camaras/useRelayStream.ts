"use client";

import { useEffect, useRef, useState } from "react";
import { withStreamStart } from "./stream-queue";
import { connectMse, connectWhep } from "./stream-protocols";

export type StreamMode = "idle" | "connecting" | "webrtc" | "mse" | "error";

type Opts = {
  src: string | null;
  token: string | null;
  relayUrl: string | null;
  enabled: boolean;
  onUnauthorized?: () => void;
};

export function useRelayStream({ src, token, relayUrl, enabled, onUnauthorized }: Opts) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<StreamMode>("idle");
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const unauthRef = useRef(onUnauthorized);
  unauthRef.current = onUnauthorized;

  const ready = Boolean(enabled && src && relayUrl && token);

  useEffect(() => {
    if (!ready || !src || !relayUrl) {
      setMode("idle");
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const ac = new AbortController();
    let pc: RTCPeerConnection | null = null;
    let mse: { close: () => void } | null = null;
    let cancelled = false;

    const run = async () => {
      setMode("connecting");
      setError(null);
      try {
        await withStreamStart(async () => {
          if (cancelled) return;
          try {
            pc = await Promise.race([
              connectWhep(video, relayUrl, src, tokenRef.current || "", ac.signal),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error("whep-timeout")), 4000)),
            ]);
            if (!cancelled) setMode("webrtc");
          } catch (err) {
            if (cancelled) return;
            if ((err as { code?: number }).code === 401) {
              unauthRef.current?.();
              throw err;
            }
            mse = connectMse(video, relayUrl, src, tokenRef.current || "");
            setMode("mse");
          }
        });
      } catch (err) {
        if (cancelled) return;
        setMode("error");
        setError(err instanceof Error ? err.message : "Sin video");
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
      pc?.close();
      mse?.close();
      video.srcObject = null;
    };
  }, [ready, src, relayUrl]);

  return { videoRef, mode, error };
}
