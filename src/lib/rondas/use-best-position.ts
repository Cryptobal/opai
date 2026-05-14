"use client";

import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

export interface BestPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}
export type GetBestPositionOptions = { windowMs?: number; goodAccuracyM?: number };

export function useBestPosition() {
  const [position, setPosition] = useState<BestPosition | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getBestPosition = useCallback((opts?: GetBestPositionOptions) => {
    const windowMs = opts?.windowMs ?? 8000;
    const goodM = opts?.goodAccuracyM ?? 20;
    setLoading(true);
    setError(null);
    let best: BestPosition | null = null;
    let last: BestPosition | null = null;
    const mark = (lat: number, lng: number, raw: number | null | undefined) => {
      const acc = raw != null && Number.isFinite(raw) && raw > 0 ? raw : 999_999;
      const cur = { latitude: lat, longitude: lng, accuracy: acc };
      last = cur;
      if (!best || acc < best.accuracy) best = cur;
    };
    const apply = (p: BestPosition | null, err: string | null) => {
      setLoading(false);
      setError(err);
      if (p) {
        setPosition(p);
        setAccuracy(p.accuracy);
      } else {
        setPosition(null);
        setAccuracy(null);
      }
      return p;
    };
    return new Promise<BestPosition | null>((resolve) => {
      let done = false;
      const fns: Array<() => void> = [];
      const stop = () => fns.splice(0).forEach((x) => x());
      let iv: ReturnType<typeof setInterval> | undefined;
      const to = setTimeout(() => end(best ?? last, !best && !last ? "Sin lectura GPS" : null), windowMs);
      function end(p: BestPosition | null, err: string | null) {
        if (done) return;
        done = true;
        stop();
        clearTimeout(to);
        if (iv) clearInterval(iv);
        resolve(apply(p, err));
      }
      const early = () => best && best.accuracy <= goodM && end(best, null);
      const wopt = { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 } as const;
      const oopt = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 } as const;
      const onPos = (pos: GeolocationPosition) => {
        mark(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        early();
      };
      if (Capacitor.isNativePlatform()) {
        void (async () => {
          try {
            const { Geolocation } = await import("@capacitor/geolocation");
            if ((await Geolocation.requestPermissions()).location !== "granted") {
              end(null, "Permiso de ubicación denegado");
              return;
            }
            const id = await Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
              if (done || err || !pos) return;
              mark(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
              early();
            });
            fns.push(() => void Geolocation.clearWatch({ id }));
            const poll = async () => {
              if (done) return;
              try {
                const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
                mark(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                early();
              } catch { /* noop */ }
            };
            void poll();
            iv = setInterval(() => void poll(), 2000);
          } catch (e) {
            end(null, e instanceof Error ? e.message : "Error GPS");
          }
        })();
      } else if (!navigator.geolocation) {
        end(null, "GPS no disponible");
      } else {
        const w = navigator.geolocation.watchPosition((pos) => !done && onPos(pos), () => {}, wopt);
        fns.push(() => navigator.geolocation.clearWatch(w));
        iv = setInterval(() => !done && navigator.geolocation.getCurrentPosition(onPos, () => {}, oopt), 2000);
        navigator.geolocation.getCurrentPosition(onPos, () => {}, oopt);
      }
    });
  }, []);

  return { position, accuracy, loading, error, getBestPosition };
}
