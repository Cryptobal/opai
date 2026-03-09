"use client";

import { useState, useEffect } from "react";
import {
  DEVICE_TOKEN_KEY,
  LEGACY_ACCESS_TOKEN_KEY,
  safeStorage,
} from "@/lib/device-constants";

interface DeviceInfo {
  id: string;
  installationId: string;
  installationName: string;
  tenantId: string;
  portalRondasEnabled: boolean;
  portalAccesoEnabled: boolean;
  currentGuardId: string | null;
  currentGuardName: string | null;
}

export function useDeviceToken() {
  const [token, setToken] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const legacyToken = safeStorage.getItem(LEGACY_ACCESS_TOKEN_KEY);
      const currentToken = safeStorage.getItem(DEVICE_TOKEN_KEY);

      if (legacyToken && !currentToken) {
        safeStorage.setItem(DEVICE_TOKEN_KEY, legacyToken);
        safeStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
      }

      const deviceToken = safeStorage.getItem(DEVICE_TOKEN_KEY);
      if (!deviceToken) {
        setLoading(false);
        return;
      }

      setToken(deviceToken);

      try {
        const res = await fetch("/api/devices/validate", {
          headers: { Authorization: `Bearer ${deviceToken}` },
        });

        if (!res.ok) {
          if (res.status === 401) {
            safeStorage.removeItem(DEVICE_TOKEN_KEY);
            setToken(null);
          }
          throw new Error("Dispositivo no válido");
        }

        const json = await res.json();
        if (json.success) {
          setDevice(json.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de validación");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  function saveToken(newToken: string) {
    safeStorage.setItem(DEVICE_TOKEN_KEY, newToken);
    setToken(newToken);
  }

  function clearToken() {
    safeStorage.removeItem(DEVICE_TOKEN_KEY);
    setToken(null);
    setDevice(null);
  }

  return { token, device, loading, error, saveToken, clearToken };
}
