"use client";

import { EmptyState } from "@/components/opai-ds";
import { TrendingUp } from "lucide-react";
import type { CrmDeal, CrmPipelineStage } from "@/types";
import type { DealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";
import { getDealCommercialIndicators } from "./deals-helpers";
import { DealsBoard } from "./DealsBoard";
import { DealsTable } from "./DealsTable";
import { DealsFocusView } from "./DealsFocusView";
import { DealsMobilePanes } from "./DealsMobilePanes";
import type { DealsDensity, DealsView, StageColumnState } from "./types";

type Props = {
  view: DealsView;
  density: DealsDensity;
  openStages: CrmPipelineStage[];
  closedStages: CrmPipelineStage[];
  byStage: Record<string, StageColumnState>;
  summary: DealsPipelineSummary;
  stageFilter: string;
  allDeals: CrmDeal[];
  tableDeals: CrmDeal[];
  tableLoading: boolean;
  debouncedSearch: string;
  unreadNoteIds: Set<string>;
  mobileStageId: string;
  onMobileStageChange: (id: string) => void;
  onOpenDeal: (id: string) => void;
  onLoadMore: (stageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onMoveDeal: (dealId: string, stageId: string) => void;
};

export function DealsSurface({
  view,
  density,
  openStages,
  closedStages,
  byStage,
  summary,
  stageFilter,
  allDeals,
  tableDeals,
  tableLoading,
  debouncedSearch,
  unreadNoteIds,
  mobileStageId,
  onMobileStageChange,
  onOpenDeal,
  onLoadMore,
  onAddDeal,
  onMoveDeal,
}: Props) {
  if (summary.open.count === 0 && allDeals.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={debouncedSearch ? "Sin resultados" : "Sin negocios"}
        description={
          debouncedSearch
            ? "No hay negocios para la búsqueda seleccionada."
            : "No hay negocios creados todavía."
        }
        compact
      />
    );
  }

  const tableRows =
    view === "table"
      ? tableDeals.length > 0
        ? tableDeals
        : stageFilter === "all"
          ? allDeals
          : byStage[stageFilter]?.deals ?? []
      : [];

  const tableLocalClp = tableRows.reduce(
    (acc, d) => acc + getDealCommercialIndicators(d).amountClp,
    0,
  );
  const showClosedTotal =
    stageFilter !== "all" && closedStages.some((s) => s.id === stageFilter);

  return (
    <>
      {view === "board" ? (
        <>
          <div className="hidden min-h-0 flex-1 md:flex">
            <DealsBoard
              openStages={openStages}
              byStage={byStage}
              summary={summary}
              stageFilter={stageFilter}
              density={density}
              unreadNoteIds={unreadNoteIds}
              onOpenDeal={onOpenDeal}
              onLoadMore={onLoadMore}
              onAddDeal={onAddDeal}
              onMoveDeal={onMoveDeal}
            />
          </div>
          <DealsMobilePanes
            stages={[...openStages, ...closedStages]}
            byStage={byStage}
            summary={summary}
            activeStageId={mobileStageId}
            onActiveStageChange={onMobileStageChange}
            density={density}
            unreadNoteIds={unreadNoteIds}
            onOpenDeal={onOpenDeal}
            onLoadMore={onLoadMore}
          />
        </>
      ) : null}

      {view === "table" ? (
        <DealsTable
          deals={tableRows}
          loading={tableLoading}
          emptySearch={Boolean(debouncedSearch)}
          onRowClick={(d) => onOpenDeal(d.id)}
          localTotalClp={showClosedTotal ? tableLocalClp : undefined}
        />
      ) : null}

      {view === "focus" ? (
        <DealsFocusView deals={allDeals} onOpen={(d) => onOpenDeal(d.id)} />
      ) : null}
    </>
  );
}
