"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Captura nivel de audio (RMS 0–1) en un ref vía AnalyserNode + rAF.
 * No dispara re-renders.
 *
 * IMPORTANTE: no llama a `getUserMedia`. Debe recibir el mismo `MediaStream`
 * que ya abrió el dictado (gesto del usuario). Pedir mic de nuevo desde un
 * `useEffect` re-prompteaba el permiso en PWA/iOS en cada sesión.
 */
export function useAudioLevel(
  active: boolean,
  mediaStream?: MediaStream | null,
): MutableRefObject<number> {
  const levelRef = useRef(0);

  useEffect(() => {
    if (!active || !mediaStream) {
      levelRef.current = 0;
      return;
    }

    let cancelled = false;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let analyser: AnalyserNode | null = null;

    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const source = ctx.createMediaStreamSource(mediaStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (cancelled || !analyser) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        levelRef.current = Math.min(1, rms * 3.2);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      levelRef.current = 0;
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      // No detener pistas del stream externo: las posee el dictado.
      void ctx?.close().catch(() => {});
      levelRef.current = 0;
    };
  }, [active, mediaStream]);

  return levelRef;
}
