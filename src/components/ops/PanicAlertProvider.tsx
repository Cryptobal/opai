"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Pusher from "pusher-js";
import { PanicFullscreenModal, type PanicAlertData } from "./PanicFullscreenModal";

// Web Audio alarm: alternating 800/600 Hz square wave
function playWebAudioAlarm(audioCtx: AudioContext) {
  function beep(freq: number, start: number, dur: number) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0.3;
    osc.start(start);
    osc.stop(start + dur);
  }
  for (let i = 0; i < 8; i++) {
    beep(800, audioCtx.currentTime + i * 0.5, 0.25);
    beep(600, audioCtx.currentTime + i * 0.5 + 0.25, 0.25);
  }
}

interface PanicAlertProviderProps {
  tenantId: string;
  children: React.ReactNode;
}

export function PanicAlertProvider({ tenantId, children }: PanicAlertProviderProps) {
  const [activePanics, setActivePanics] = useState<PanicAlertData[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const isAudioLeaderRef = useRef(false);

  // Stop alarm sound and dismiss SW notifications
  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    isAudioLeaderRef.current = false;

    // Tell Service Worker to close panic notifications
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "DISMISS_PANIC" });
    }
  }, []);

  // Start alarm sound
  const startAlarm = useCallback(() => {
    if (alarmIntervalRef.current) return; // Already playing

    // Create AudioContext on demand (browser autoplay policy)
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch {
        console.warn("[PanicAlarm] No se pudo crear AudioContext");
        return;
      }
    }

    const ctx = audioCtxRef.current;

    // Helper: play alarm only when context is running
    const playWhenReady = () => {
      if (ctx.state === "running") {
        playWebAudioAlarm(ctx);
      } else if (ctx.state === "suspended") {
        // Await resume and play once it resolves
        ctx.resume().then(() => playWebAudioAlarm(ctx)).catch(() => {});
      }
    };

    // Play immediately (handles suspended state)
    playWhenReady();

    // Repeat every 10 seconds — also retry resume if still suspended
    alarmIntervalRef.current = setInterval(() => {
      if (!audioCtxRef.current) return;
      playWhenReady();
    }, 10000);
  }, []);

  // Resolve a panic locally (remove from state, stop alarm if none left)
  const resolveLocal = useCallback(
    (alertaId: string) => {
      setActivePanics((prev) => {
        const next = prev.filter((p) => p.alertaId !== alertaId);
        if (next.length === 0) stopAlarm();
        return next;
      });
    },
    [stopAlarm],
  );

  // Pre-unlock AudioContext on first user interaction (click/keydown/touch)
  // so it's ready to play when a panic event arrives
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        try {
          audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        } catch { /* ignore */ }
      }
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    const events: (keyof WindowEventMap)[] = ["click", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, unlock, { once: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, unlock));
    };
  }, []);

  // Cross-tab coordination
  useEffect(() => {
    try {
      const bc = new BroadcastChannel("opai-panic");
      broadcastRef.current = bc;
      bc.onmessage = (event) => {
        if (event.data?.type === "panic-resolved" && event.data?.alertaId) {
          resolveLocal(event.data.alertaId);
        }
        if (event.data?.type === "panic-audio-claimed") {
          // Another tab claimed audio leadership
          isAudioLeaderRef.current = false;
          stopAlarm();
        }
      };
      return () => bc.close();
    } catch {
      // Fallback: localStorage event for Safari < 15.4
      const handler = (e: StorageEvent) => {
        if (e.key === "opai-panic-resolved" && e.newValue) {
          resolveLocal(e.newValue);
        }
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    }
  }, [resolveLocal, stopAlarm]);

  // Service Worker push message listener — fires when push arrives while tab is open
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PANIC_PUSH") {
        // Trigger alarm immediately from push (before Pusher confirms)
        if (!isAudioLeaderRef.current) {
          isAudioLeaderRef.current = true;
          startAlarm();
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [startAlarm]);

  // Pusher subscription — global listener for panic alerts
  useEffect(() => {
    if (!tenantId) return;
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!pusherKey || !pusherCluster) {
      // Sin Pusher configurado (dev local) saltamos en silencio.
      return;
    }

    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
    });
    const channel = pusher.subscribe(`monitoreo-${tenantId}`);

    channel.bind("alerta-panico", (data: PanicAlertData) => {
      setActivePanics((prev) => {
        // Deduplicate by alertaId
        if (prev.some((p) => p.alertaId === data.alertaId)) return prev;
        return [...prev, data];
      });

      // Claim audio leadership if no other tab has it
      if (!isAudioLeaderRef.current) {
        isAudioLeaderRef.current = true;
        try {
          broadcastRef.current?.postMessage({ type: "panic-audio-claimed" });
        } catch { /* ignore */ }
        startAlarm();
      }
    });

    // Listen for acknowledge — stop alarm on ALL devices immediately
    channel.bind("panico-atendido", (data: { alertaId?: string }) => {
      if (data.alertaId) resolveLocal(data.alertaId);
    });

    // Listen for resolve — final cleanup for any remaining state
    channel.bind("panic-resolved", (data: { alertId?: string; alertaId?: string }) => {
      const id = data.alertId || data.alertaId;
      if (id) resolveLocal(id);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`monitoreo-${tenantId}`);
      pusher.disconnect();
    };
  }, [tenantId, startAlarm, resolveLocal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAlarm();
    };
  }, [stopAlarm]);

  // Resolve handler — calls /resolve API with required notes, then resolves locally
  const handleResolve = useCallback(
    async (alertaId: string, resolutionNotes: string) => {
      const res = await fetch(`/api/ops/rondas/alertas/${alertaId}/resolve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutionNotes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Error al resolver" }));
        throw new Error(body.error || "Error al resolver");
      }

      resolveLocal(alertaId);

      // Notify other tabs
      try {
        broadcastRef.current?.postMessage({ type: "panic-resolved", alertaId });
      } catch { /* ignore */ }
      try {
        localStorage.setItem("opai-panic-resolved", alertaId);
      } catch { /* ignore */ }
    },
    [resolveLocal],
  );

  return (
    <>
      {children}
      {activePanics.length > 0 && (
        <PanicFullscreenModal
          alerts={activePanics}
          onResolve={handleResolve}
        />
      )}
    </>
  );
}
