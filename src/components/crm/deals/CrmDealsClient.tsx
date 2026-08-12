"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocalStorage, useUnreadNoteIds } from "@/lib/hooks";
import { OnboardingClientModal } from "@/components/crm/onboarding/OnboardingClientModal";
import type { CrmDeal } from "@/types";
import { DEAL_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";
import { getDealsFocusLabel, isOpenStage } from "./deals-helpers";
import { useDealsBoardData } from "./useDealsBoardData";
import { useDealStageMove } from "./useDealStageMove";
import { useCreateDeal } from "./useCreateDeal";
import { DealsTopBar } from "./DealsTopBar";
import { PipelineRail } from "./PipelineRail";
import { DealsSurface } from "./DealsSurface";
import { DealDetailPanel } from "./DealDetailPanel";
import { CreateDealDialog } from "./CreateDealDialog";
import { AcceptedDateDialog } from "./AcceptedDateDialog";
import type { CrmDealsClientProps, DealsDensity, DealsView } from "./types";

export function CrmDealsClient({
  accounts: initialAccounts,
  stages,
  initialFocus = "all",
  initialSummary,
  initialByStage,
}: CrmDealsClientProps) {
  const unreadNoteIds = useUnreadNoteIds("DEAL");
  const [view, setView] = useLocalStorage<DealsView>("crm-deals-view-v2", "board");
  const [density, setDensity] = useLocalStorage<DealsDensity>("crm-deals-density", "normal");
  const [panelDealId, setPanelDealId] = useState<string | null>(null);
  const [mobileStageId, setMobileStageId] = useState(
    () => stages.find(isOpenStage)?.id ?? stages[0]?.id ?? "",
  );
  const [tableDeals, setTableDeals] = useState<CrmDeal[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableSort, setTableSort] = useState<string>("newest");

  const board = useDealsBoardData({
    stages,
    initialFocus,
    initialSummary,
    initialByStage,
  });

  const create = useCreateDeal({
    initialAccounts,
    onCreated: (deal) => {
      board.upsertDeal(deal);
      void board.refreshSummary();
    },
  });

  const findDeal = useCallback(
    (id: string) => {
      for (const col of Object.values(board.byStage)) {
        const found = col.deals.find((d) => d.id === id);
        if (found) return found;
      }
      return tableDeals.find((d) => d.id === id);
    },
    [board.byStage, tableDeals],
  );

  const move = useDealStageMove({
    stages,
    findDeal,
    onOptimistic: (dealId, stage) => {
      const current = findDeal(dealId);
      if (!current) return;
      board.removeDealFromStage(dealId, current.stageId);
      board.upsertDeal({
        ...current,
        stageId: stage.id,
        stage,
        status: stage.isClosedWon ? "won" : stage.isClosedLost ? "lost" : "open",
      });
    },
    onRollback: (deal) => board.upsertDeal(deal),
    onSuccess: (deal) => board.upsertDeal(deal),
    onRefreshSummary: () => void board.refreshSummary(),
  });

  const closedStages = useMemo(
    () => stages.filter((s) => s.isClosedWon || s.isClosedLost),
    [stages],
  );

  const loadTable = useCallback(
    async (stageId?: string, sortOverride?: string) => {
      setTableLoading(true);
      try {
        const params = new URLSearchParams({
          page: "1",
          limit: String(DEAL_LIST_DEFAULT_PAGE_SIZE),
          focus: initialFocus,
          sort: sortOverride ?? tableSort,
        });
        if (board.debouncedSearch) params.set("search", board.debouncedSearch);
        if (stageId && stageId !== "all") params.set("stageId", stageId);
        const res = await fetch(`/api/crm/deals?${params}`);
        const payload = await res.json();
        if (payload.success) setTableDeals(payload.data ?? []);
      } catch {
        toast.error("No se pudo cargar la tabla.");
      } finally {
        setTableLoading(false);
      }
    },
    [initialFocus, tableSort, board.debouncedSearch],
  );

  const onLoadMore = (sid: string) => {
    const col = board.byStage[sid];
    if (!col?.hasMore || col.loading) return;
    void board.loadStagePage(sid, col.page + 1, false);
  };

  return (
    <div className="deals-shell flex h-[calc(100dvh-var(--app-topbar-offset))] min-h-0 flex-col gap-3 overflow-hidden pb-2">
      <DealsTopBar
        summary={board.summary}
        search={board.search}
        onSearchChange={board.setSearch}
        focusLabel={getDealsFocusLabel(initialFocus)}
        onNewDeal={() => create.openCreate()}
      />
      <PipelineRail
        openStages={board.openStages}
        closedStages={closedStages}
        summary={board.summary}
        stageFilter={board.stageFilter}
        onStageFilter={(id) => {
          board.setStageFilter(id);
          if (view === "table") void loadTable(id);
        }}
        onClosedStage={(stageId) => {
          board.setStageFilter(stageId);
          setView("table");
          void loadTable(stageId);
        }}
        view={view}
        onViewChange={(v) => {
          setView(v);
          if (v === "table") void loadTable(board.stageFilter);
        }}
        density={density}
        onDensityChange={setDensity}
      />

      <DealsSurface
        view={view}
        density={density}
        openStages={board.openStages}
        closedStages={closedStages}
        byStage={board.byStage}
        summary={board.summary}
        stageFilter={board.stageFilter}
        allDeals={board.allDeals}
        tableDeals={tableDeals}
        tableLoading={tableLoading}
        debouncedSearch={board.debouncedSearch}
        unreadNoteIds={unreadNoteIds}
        mobileStageId={mobileStageId}
        onMobileStageChange={setMobileStageId}
        onOpenDeal={setPanelDealId}
        onLoadMore={onLoadMore}
        onAddDeal={(sid) => create.openCreate(sid)}
        onMoveDeal={(dealId, stageId) => void move.updateStage(dealId, stageId)}
        onClosedStage={(stageId) => {
          board.setStageFilter(stageId);
          setView("table");
          void loadTable(stageId);
        }}
        onCloseDateSort={(sort) => {
          setTableSort(sort);
          void loadTable(board.stageFilter, sort);
        }}
      />

      <Button
        size="icon"
        className="fixed z-30 h-12 w-12 rounded-full shadow-lg md:hidden"
        style={{ right: "1rem", bottom: "calc(7.5rem + env(safe-area-inset-bottom))" }}
        onClick={() => create.openCreate()}
        aria-label="Nuevo negocio"
      >
        <Plus className="h-5 w-5" />
      </Button>

      <DealDetailPanel
        deal={panelDealId ? findDeal(panelDealId) ?? null : null}
        stages={stages}
        onClose={() => setPanelDealId(null)}
        onMoveStage={(dealId, stageId) => void move.updateStage(dealId, stageId)}
      />

      <CreateDealDialog
        open={create.open}
        onOpenChange={(next) => {
          create.setOpen(next);
          if (next) void create.ensureAccounts();
        }}
        form={create.form}
        onChange={create.setFormField}
        accounts={create.accounts}
        stages={stages}
        loadingAccounts={create.loadingAccounts}
        creating={create.creating}
        onSubmit={() => void create.createDeal()}
      />

      <AcceptedDateDialog
        open={!!move.acceptedPending}
        date={move.acceptedDate}
        onDateChange={move.setAcceptedDate}
        onCancel={() => move.setAcceptedPending(null)}
        onConfirm={() => void move.confirmAccepted()}
      />

      {move.onboardingTarget ? (
        <OnboardingClientModal
          open
          dealId={move.onboardingTarget.dealId}
          defaultPlaybookId={move.onboardingTarget.defaultPlaybookId}
          onClose={() => {
            toast.message("Puedes iniciar el onboarding desde la cuenta cuando quieras");
            move.setOnboardingTarget(null);
          }}
          onCreated={() => move.setOnboardingTarget(null)}
        />
      ) : null}
    </div>
  );
}
