"use client";

import { useState, useEffect, useCallback } from "react";

const CACHE_PREFIX = "ac_config_cache_";

export interface AccessControlConfig {
  installationId: string;
  name: string;
  requiresRut: boolean;
  requiresPhoto: boolean;
  requiresVehicle: boolean;
  allowedListIds: string[];
  blockedListIds: string[];
  entryTypes: string[];
  customFields: { key: string; label: string; required: boolean }[];
  [key: string]: unknown;
}

interface UseAccessControlConfigReturn {
  config: AccessControlConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function getCacheKey(installationId: string): string {
  return `${CACHE_PREFIX}${installationId}`;
}

function readCache(installationId: string): AccessControlConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getCacheKey(installationId));
    return raw ? (JSON.parse(raw) as AccessControlConfig) : null;
  } catch {
    return null;
  }
}

function writeCache(installationId: string, config: AccessControlConfig): void {
  try {
    localStorage.setItem(getCacheKey(installationId), JSON.stringify(config));
  } catch {
    // Storage full or unavailable
  }
}

export function useAccessControlConfig(
  installationId: string | null
): UseAccessControlConfigReturn {
  const [config, setConfig] = useState<AccessControlConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!installationId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/access-control/config/${installationId}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.status}`);
      }
      const data = (await response.json()) as AccessControlConfig;
      writeCache(installationId, data);
      setConfig(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al cargar configuración";
      setError(message);

      // Fall back to cached version when offline or on error
      const cached = readCache(installationId);
      if (cached) {
        setConfig(cached);
        setError(null); // Clear error if cache is available
      }
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  // Fetch on mount and when installationId changes
  useEffect(() => {
    if (installationId) {
      // Try cache first for instant display
      const cached = readCache(installationId);
      if (cached) {
        setConfig(cached);
      }
      fetchConfig();
    } else {
      setConfig(null);
    }
  }, [installationId, fetchConfig]);

  return { config, loading, error, refresh: fetchConfig };
}
