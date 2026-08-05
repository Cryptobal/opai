"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useLocalStorage } from "@/lib/hooks";
import type { CrmDeal, CrmPipelineStage } from "@/types";
import type { DealsPipelineSummary } from "@/lib/crm/deals-pipeline-summary";
import { DealColumn } from "./DealColumn";
import { DealCard } from "./DealCard";
import { useDealsBoardDnd } from "./useDealsBoardDnd";
import type { DealsDensity, StageColumnState } from "./types";

type Props = {
  openStages: CrmPipelineStage[];
  closedStages: CrmPipelineStage[];
  byStage: Record<string, StageColumnState>;
  summary: DealsPipelineSummary;
  stageFilter: string;
  density: DealsDensity;
  unreadNoteIds: Set<string>;
  onOpenDeal: (id: string) => void;
  onLoadMore: (stageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onMoveDeal: (dealId: string, stageId: string) => void;
  onClosedStage: (stageId: string) => void;
};

export function DealsBoard({
  openStages,
  closedStages,
  byStage,
  summary,
  stageFilter,
  density,
  unreadNoteIds,
  onOpenDeal,
  onLoadMore,
  onAddDeal,
  onMoveDeal,
  onClosedStage,
}: Props) {
  const visible =
    stageFilter === "all"
      ? openStages
      : openStages.filter((s) => s.id === stageFilter);

  const [collapsed, setCollapsed] = useLocalStorage<string[]>(
    "crm-deals-collapsed",
    [],
  );
  const collapsedSet = new Set(collapsed);
  const allDeals = openStages.flatMap((s) => byStage[s.id]?.deals ?? []);
  const dnd = useDealsBoardDnd({
    allDeals,
    collapsed,
    setCollapsed,
    onMoveDeal,
  });
  const activeDeal = dnd.activeDealId
    ? allDeals.find((d) => d.id === dnd.activeDealId)
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const toggleCollapse = (stageId: string) => {
    setCollapsed(
      collapsedSet.has(stageId)
        ? collapsed.filter((id) => id !== stageId)
        : [...collapsed, stageId],
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dnd.collisionDetection}
      onDragStart={dnd.handleDragStart}
      onDragOver={dnd.handleDragOver}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      <div className="deals-board-scroll flex h-full min-h-0 flex-1 gap-3 overflow-x-auto snap-x snap-proximity">
        {visible.map((stage) => {
          const col = byStage[stage.id];
          const deals = col?.deals ?? [];
          const totals = summary.stages[stage.id];
          const isCollapsed = collapsedSet.has(stage.id);
          return (
            <DealColumn
              key={stage.id}
              stage={stage}
              count={totals?.count ?? deals.length}
              total={col?.total ?? totals?.count ?? 0}
              clp={totals?.clp ?? 0}
              uf={totals?.uf ?? null}
              collapsed={isCollapsed}
              onToggleCollapse={() => toggleCollapse(stage.id)}
              highlightDropTarget={
                isCollapsed &&
                dnd.activeDealId != null &&
                dnd.hoveredCollapsed === stage.id
              }
              loading={col?.loading}
              hasMore={col?.hasMore}
              loadedCount={deals.length}
              onLoadMore={() => onLoadMore(stage.id)}
              onAddDeal={() => onAddDeal(stage.id)}
            >
              <SortableContext
                items={deals.map((d) => `deal-${d.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {deals.length === 0 && !col?.loading ? (
                    <p className="px-1 py-6 text-center text-[12px] text-ds-text-3">
                      Sin negocios en esta etapa. Arrastra uno aquí para moverlo.
                    </p>
                  ) : null}
                  {deals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      density={density}
                      onOpen={() => onOpenDeal(deal.id)}
                      hasUnreadNotes={unreadNoteIds.has(deal.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DealColumn>
          );
        })}

        {/* Ganadas / perdidas: siempre contraídas al final → abren Tabla */}
        {stageFilter === "all"
          ? closedStages.map((stage) => {
              const count =
                summary.closedCounts[stage.id] ??
                summary.stages[stage.id]?.count ??
                0;
              return (
                <DealColumn
                  key={stage.id}
                  stage={stage}
                  count={count}
                  total={count}
                  clp={null}
                  uf={null}
                  closedRail
                  onClosedOpen={() => onClosedStage(stage.id)}
                />
              );
            })
          : null}
      </div>
      <DragOverlay
        dropAnimation={{
          duration: 220,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: "0.6" } },
          }),
        }}
      >
        {activeDeal ? (
          <DealCard deal={activeDeal as CrmDeal} isOverlay density={density} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
