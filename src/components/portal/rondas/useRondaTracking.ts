"use client";

import { useEffect, useRef } from "react";

export type RondaLatLng = { lat: number; lng: number };

type TrackingPayload = {
  ejecucionId: string;
  guardiaId: string;
  lat: number;
  lng: number;
};
type FlushPayload = {
  ejecucionId: string;
  guardiaId: string;
  points: RondaLatLng[];
};

export type UseRondaTrackingOptions = {
  ejecucionId: string;
  guardiaId: string;
  getPosition: () => RondaLatLng | null;
  getTrail: () => RondaLatLng[];
  sendTracking?: (payload: TrackingPayload) => Promise<void>;
  sendFlush?: (payload: FlushPayload) => Promise<void>;
};

const TRACKING_MS = 30_000;
const FLUSH_MS = 60_000;

async function defaultSendTracking(payload: TrackingPayload) {
  await fetch("/api/portal/rondas/tracking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function defaultSendFlush(payload: FlushPayload) {
  await fetch("/api/portal/rondas/walk-route-flush", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function publishDevCounts(counts: { tracking: number; flush: number }) {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  (window as unknown as { __opaiRondaTracking?: typeof counts }).__opaiRondaTracking = {
    ...counts,
  };
}

/** GPS tracking + walk-route flush; getters keep interval deps stable. */
export function useRondaTracking({
  ejecucionId,
  guardiaId,
  getPosition,
  getTrail,
  sendTracking = defaultSendTracking,
  sendFlush = defaultSendFlush,
}: UseRondaTrackingOptions): void {
  const getPositionRef = useRef(getPosition);
  const getTrailRef = useRef(getTrail);
  const sendTrackingRef = useRef(sendTracking);
  const sendFlushRef = useRef(sendFlush);
  getPositionRef.current = getPosition;
  getTrailRef.current = getTrail;
  sendTrackingRef.current = sendTracking;
  sendFlushRef.current = sendFlush;

  const trackingPointsRef = useRef<Array<RondaLatLng & { ts: number }>>([]);
  const countsRef = useRef({ tracking: 0, flush: 0 });

  useEffect(() => {
    const tick = async () => {
      const pos = getPositionRef.current();
      if (!pos) return;
      try {
        await sendTrackingRef.current({
          ejecucionId,
          guardiaId,
          lat: pos.lat,
          lng: pos.lng,
        });
        trackingPointsRef.current = [
          ...trackingPointsRef.current,
          { lat: pos.lat, lng: pos.lng, ts: Date.now() },
        ];
        countsRef.current.tracking += 1;
        publishDevCounts(countsRef.current);
      } catch {
        // Silent fail — tracking is best-effort
      }
    };
    void tick();
    const id = setInterval(() => void tick(), TRACKING_MS);
    return () => clearInterval(id);
  }, [ejecucionId, guardiaId]);

  useEffect(() => {
    const tick = async () => {
      const points = getTrailRef.current();
      if (points.length < 2) return;
      try {
        // FULL trail — server replaces walkRoute atomically
        await sendFlushRef.current({ ejecucionId, guardiaId, points });
        countsRef.current.flush += 1;
        publishDevCounts(countsRef.current);
      } catch {
        // Silent fail — flush is best-effort
      }
    };
    const id = setInterval(() => void tick(), FLUSH_MS);
    return () => clearInterval(id);
  }, [ejecucionId, guardiaId]);
}
