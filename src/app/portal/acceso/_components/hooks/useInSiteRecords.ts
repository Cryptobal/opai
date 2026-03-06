"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const REFRESH_INTERVAL = 30_000; // 30 seconds

export interface InSiteRecord {
  id: string;
  type: "person" | "vehicle";
  name: string;
  rut?: string;
  plate?: string;
  entryTime: string;
  area?: string;
  company?: string;
  [key: string]: unknown;
}

interface UseInSiteRecordsReturn {
  records: InSiteRecord[];
  personCount: number;
  vehicleCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useInSiteRecords(
  installationId: string | null
): UseInSiteRecordsReturn {
  const [records, setRecords] = useState<InSiteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!installationId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/access-control/records/${installationId}/in-site`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch records: ${response.status}`);
      }
      const data = (await response.json()) as InSiteRecord[];
      setRecords(data);
    } catch {
      // Silently fail; keep existing records
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  // Fetch on mount and set up auto-refresh
  useEffect(() => {
    if (!installationId) {
      setRecords([]);
      return;
    }

    fetchRecords();

    intervalRef.current = setInterval(fetchRecords, REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [installationId, fetchRecords]);

  const personCount = records.filter((r) => r.type === "person").length;
  const vehicleCount = records.filter((r) => r.type === "vehicle").length;

  return {
    records,
    personCount,
    vehicleCount,
    loading,
    refresh: fetchRecords,
  };
}
