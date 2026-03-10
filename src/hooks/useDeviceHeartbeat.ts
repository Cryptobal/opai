"use client";

import { useEffect, useRef } from "react";
import {
  DEVICE_TOKEN_KEY,
  HEARTBEAT_INTERVAL_MS,
  safeStorage,
} from "@/lib/device-constants";

export function useDeviceHeartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const token = safeStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) return;

    async function sendHeartbeat() {
      try {
        const token = safeStorage.getItem(DEVICE_TOKEN_KEY);
        if (!token) return;

        const payload: Record<string, unknown> = {};

        try {
          const battery = await (navigator as any).getBattery?.();
          if (battery) {
            payload.batteryLevel = battery.level;
            payload.batteryCharging = battery.charging;
          }
        } catch {}

        try {
          const conn = (navigator as any).connection;
          if (conn) {
            payload.connectionType = conn.effectiveType ?? null;
            payload.connectionDownlink = conn.downlink ?? null;
          }
        } catch {}

        await fetch("/api/devices/heartbeat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } catch {
        // Silently fail - device may be offline
      }
    }

    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}
