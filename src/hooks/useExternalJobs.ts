"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExternalJob } from "@/lib/ats/jooble.service";

export type UseExternalJobsOptions = {
  /** Delay en ms antes de disparar la búsqueda (default 300) */
  debounceMs?: number;
};

export type UseExternalJobsReturn = {
  jobs: ExternalJob[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  page: number;
  hasMore: boolean;
  search: (keywords: string, location?: string) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPage: (page: number) => void;
};

const LIMIT = 20;

export function useExternalJobs(
  opts: UseExternalJobsOptions = {},
): UseExternalJobsReturn {
  const { debounceMs = 300 } = opts;

  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  const keywordsRef = useRef("");
  const locationRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchJobs = useCallback(async (kw: string, loc: string, pg: number) => {
    if (!kw.trim()) {
      setJobs([]);
      setTotalCount(0);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: kw,
        page: String(pg),
        limit: String(LIMIT),
      });
      if (loc) params.set("location", loc);

      const res = await fetch(`/api/ops/ats/jobs/external/jooble?${params}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Error buscando empleos externos");
      }

      setJobs(
        (data.data as ExternalJob[]).map((j) => ({
          ...j,
          postedAt: new Date(j.postedAt),
          fetchedAt: new Date(j.fetchedAt),
        })),
      );
      setTotalCount(data.pagination.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when page changes
  useEffect(() => {
    if (keywordsRef.current) {
      void fetchJobs(keywordsRef.current, locationRef.current, page);
    }
  }, [page, fetchJobs]);

  const search = useCallback(
    (keywords: string, location?: string) => {
      keywordsRef.current = keywords;
      locationRef.current = location ?? "";

      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        setPage(1);
        void fetchJobs(keywords, location ?? "", 1);
      }, debounceMs);
    },
    [debounceMs, fetchJobs],
  );

  const totalPages = Math.ceil(totalCount / LIMIT);
  const hasMore = page < totalPages;

  const nextPage = useCallback(() => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);

  const prevPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  return {
    jobs,
    loading,
    error,
    totalCount,
    page,
    hasMore,
    search,
    nextPage,
    prevPage,
    setPage,
  };
}
