"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { CrmDeal, CrmPipelineStage } from "@/types";
import type { DealsFocus } from "@/lib/crm/list-deals";
import { DEAL_LIST_BOARD_PAGE_SIZE_PER_STAGE } from "@/lib/crm/list-page-sizes";
import type { DealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";
import { isOpenStage } from "./deals-helpers";
import type { StageColumnState } from "./types";

type InitialByStage = Record<
  string,
  { deals: CrmDeal[]; total: number; hasMore: boolean }
>;

export function useDealsBoardData({
  stages,
  initialFocus,
  initialSummary,
  initialByStage,
}: {
  stages: CrmPipelineStage[];
  initialFocus: DealsFocus;
  initialSummary: DealsPipelineSummary;
  initialByStage: InitialByStage;
}) {
  const openStages = useMemo(() => stages.filter(isOpenStage), [stages]);

  const [byStage, setByStage] = useState<Record<string, StageColumnState>>(() => {
    const map: Record<string, StageColumnState> = {};
    for (const s of openStages) {
      const init = initialByStage[s.id];
      map[s.id] = {
        deals: init?.deals ?? [],
        page: 1,
        hasMore: init?.hasMore ?? false,
        loading: false,
        total: init?.total ?? 0,
      };
    }
    return map;
  });

  const [summary, setSummary] = useState(initialSummary);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const skipFirst = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const refreshSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams({ focus: initialFocus });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/crm/deals/summary?${params}`);
      const payload = await res.json();
      if (payload.success) setSummary(payload.data);
    } catch {
      /* silencioso: el tablero sigue usable */
    }
  }, [initialFocus, debouncedSearch]);

  const loadStagePage = useCallback(
    async (stageId: string, pageNum: number, replace: boolean) => {
      setByStage((prev) => ({
        ...prev,
        [stageId]: {
          ...(prev[stageId] ?? { deals: [], page: 1, hasMore: false, total: 0, loading: false }),
          loading: true,
        },
      }));
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: String(DEAL_LIST_BOARD_PAGE_SIZE_PER_STAGE),
          focus: initialFocus,
          sort,
          stageId,
        });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetch(`/api/crm/deals?${params}`);
        const payload = await res.json();
        if (!payload.success) throw new Error(payload.error || "Error");
        const incoming: CrmDeal[] = payload.data ?? [];
        setByStage((prev) => {
          const cur = prev[stageId];
          return {
            ...prev,
            [stageId]: {
              deals: replace ? incoming : [...(cur?.deals ?? []), ...incoming],
              page: pageNum,
              hasMore: Boolean(payload.meta?.hasMore),
              total: payload.meta?.total ?? incoming.length,
              loading: false,
            },
          };
        });
      } catch {
        toast.error("No se pudieron cargar los negocios.");
        setByStage((prev) => ({
          ...prev,
          [stageId]: { ...prev[stageId], loading: false },
        }));
      }
    },
    [initialFocus, sort, debouncedSearch],
  );

  const reloadAllOpenStages = useCallback(async () => {
    await Promise.all(
      openStages.map((s) => loadStagePage(s.id, 1, true)),
    );
    await refreshSummary();
  }, [openStages, loadStagePage, refreshSummary]);

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      if (!debouncedSearch && sort === "newest") return;
    }
    void reloadAllOpenStages();
  }, [debouncedSearch, sort, initialFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const allDeals = useMemo(
    () => openStages.flatMap((s) => byStage[s.id]?.deals ?? []),
    [openStages, byStage],
  );

  const upsertDeal = useCallback((deal: CrmDeal) => {
    setByStage((prev) => {
      const next = { ...prev };
      for (const [sid, col] of Object.entries(next)) {
        next[sid] = {
          ...col,
          deals: col.deals.filter((d) => d.id !== deal.id),
        };
      }
      const target = deal.stage?.id ?? deal.stageId;
      const col = next[target];
      if (col) {
        next[target] = {
          ...col,
          deals: [deal, ...col.deals.filter((d) => d.id !== deal.id)],
          total: col.deals.some((d) => d.id === deal.id) ? col.total : col.total + 1,
        };
      }
      return next;
    });
  }, []);

  const removeDealFromStage = useCallback((dealId: string, stageId: string) => {
    setByStage((prev) => {
      const col = prev[stageId];
      if (!col) return prev;
      return {
        ...prev,
        [stageId]: {
          ...col,
          deals: col.deals.filter((d) => d.id !== dealId),
          total: Math.max(0, col.total - 1),
        },
      };
    });
  }, []);

  return {
    openStages,
    byStage,
    summary,
    search,
    setSearch,
    debouncedSearch,
    sort,
    setSort,
    stageFilter,
    setStageFilter,
    allDeals,
    loadStagePage,
    refreshSummary,
    reloadAllOpenStages,
    upsertDeal,
    removeDealFromStage,
    setByStage,
  };
}
