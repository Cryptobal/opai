"use client";

import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function useGeolocation() {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getCurrentPosition = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const perms = await Geolocation.requestPermissions();
        if (perms.location !== "granted") {
          setError("Permiso de ubicación denegado");
          return null;
        }
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
        const result = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setPosition(result);
        return result;
      } else {
        return new Promise<Position | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const result = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              };
              setPosition(result);
              resolve(result);
            },
            (err) => {
              setError(err.message);
              resolve(null);
            },
            { enableHighAccuracy: true }
          );
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al obtener ubicación";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { position, error, loading, getCurrentPosition };
}
