"use client";

import { useCallback, useRef, useState } from "react";
import {
  type CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  closestCorners,
  pointerWithin,
} from "@dnd-kit/core";
import type { CrmDeal } from "@/types";

const DRAG_AUTO_EXPAND_DELAY_MS = 400;

export function useDealsBoardDnd({
  allDeals,
  collapsed,
  setCollapsed,
  onMoveDeal,
}: {
  allDeals: CrmDeal[];
  collapsed: string[];
  setCollapsed: (next: string[]) => void;
  onMoveDeal: (dealId: string, stageId: string) => void;
}) {
  const collapsedSet = new Set(collapsed);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [hoveredCollapsed, setHoveredCollapsed] = useState<string | null>(null);
  const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingExpand = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);

  const clearTimer = () => {
    if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
    autoExpandTimer.current = null;
    pendingExpand.current = null;
  };

  const resolveStageId = useCallback(
    (overId: string): string | undefined => {
      if (overId.startsWith("stage-header-")) return overId.replace("stage-header-", "");
      if (overId.startsWith("stage-")) return overId.replace("stage-", "");
      return allDeals.find((d) => `deal-${d.id}` === overId)?.stage?.id;
    },
    [allDeals],
  );

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointer = pointerWithin(args);
    return pointer.length > 0 ? pointer : closestCorners(args);
  }, []);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDealId(String(e.active.id).replace("deal-", ""));
    setHoveredCollapsed(null);
    hoveredRef.current = null;
    clearTimer();
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over ? String(e.over.id) : "";
    const stageId = overId ? resolveStageId(overId) : undefined;
    if (!stageId) {
      setHoveredCollapsed(null);
      hoveredRef.current = null;
      clearTimer();
      return;
    }
    const isCollapsed = collapsedSet.has(stageId);
    hoveredRef.current = isCollapsed ? stageId : null;
    setHoveredCollapsed(isCollapsed ? stageId : null);
    if (!isCollapsed) {
      clearTimer();
      return;
    }
    if (pendingExpand.current === stageId) return;
    clearTimer();
    pendingExpand.current = stageId;
    autoExpandTimer.current = setTimeout(() => {
      setCollapsed(collapsed.filter((id) => id !== stageId));
      pendingExpand.current = null;
      autoExpandTimer.current = null;
    }, DRAG_AUTO_EXPAND_DELAY_MS);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    clearTimer();
    const fallback = hoveredRef.current;
    hoveredRef.current = null;
    setHoveredCollapsed(null);
    const dealId = String(e.active.id).replace("deal-", "");
    const overId = e.over ? String(e.over.id) : null;
    const source = allDeals.find((d) => d.id === dealId)?.stage?.id ?? null;
    const resolved = overId ? resolveStageId(overId) : undefined;
    const stageId =
      resolved && resolved !== source
        ? resolved
        : fallback && fallback !== source
          ? fallback
          : undefined;
    if (stageId) onMoveDeal(dealId, stageId);
    setActiveDealId(null);
  };

  const handleDragCancel = () => {
    clearTimer();
    setActiveDealId(null);
    setHoveredCollapsed(null);
  };

  return {
    activeDealId,
    hoveredCollapsed,
    collisionDetection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
