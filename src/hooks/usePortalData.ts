"use client";

import { useCallback, useEffect, useState } from "react";
import { usePortalSession } from "@/contexts/portal-cliente-session-context";
import { portalFetch } from "@/lib/portal-cliente-fetch";
import { getDemoData, hasDemoData, type DemoKey } from "@/lib/portal/demo-registry";

type Options<T> = {
  endpoint: string;
  params?: Record<string, string | undefined>;
  demoKey: DemoKey;
  skip?: boolean;
  transformResponse?: (raw: unknown) => T;
};

export type PortalDataState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  refetch: () => Promise<void>;
};

function buildQueryString(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  ) as [string, string][];
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries).toString();
}

export function usePortalData<T>(options: Options<T>): PortalDataState<T> {
  const { session } = usePortalSession();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDemo = !!session?.isProspect && hasDemoData(options.demoKey);
  const paramsKey = JSON.stringify(options.params ?? {});

  const load = useCallback(async () => {
    if (!session) return;
    if (options.skip) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isDemo) {
        const demo = getDemoData<T>(options.demoKey, session);
        setData(
          options.transformResponse ? options.transformResponse(demo) : demo,
        );
      } else {
        const qs = buildQueryString(options.params);
        const res = await portalFetch(`${options.endpoint}${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success === false) throw new Error(json.error || "Error");
        const raw = json.data !== undefined ? json.data : json;
        setData(
          (options.transformResponse
            ? options.transformResponse(raw)
            : raw) as T,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, options.endpoint, isDemo, options.demoKey, options.skip, paramsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, isDemo, refetch: load };
}
