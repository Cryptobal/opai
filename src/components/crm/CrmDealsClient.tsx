/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/lib/hooks";
import { CrmAccount, CrmDeal, CrmPipelineStage } from "@/types";
import { EmptyState } from "@/components/opai/EmptyState";
import { GripVertical, Loader2, Plus, ExternalLink, TrendingUp, ChevronRight, ChevronDown, ChevronUp, Clock3, FileText } from "lucide-react";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";
import { toast } from "sonner";

type DealFormState = {
  title: string;
  accountId: string;
  stageId: string;
  amount: string;
  probability: string;
  expectedCloseDate: string;
};

const DEFAULT_FORM: DealFormState = {
  title: "",
  accountId: "",
  stageId: "",
  amount: "",
  probability: "",
  expectedCloseDate: "",
};

type DealsFocus =
  | "all"
  | "proposals-sent-30d"
  | "won-after-proposal-30d"
  | "followup-open"
  | "followup-overdue";

function getDealsFocusLabel(focus: DealsFocus): string | null {
  if (focus === "proposals-sent-30d") return "Mostrando propuestas enviadas en los últimos 30 días";
  if (focus === "won-after-proposal-30d") return "Mostrando negocios ganados tras propuesta en 30 días";
  if (focus === "followup-open") return "Mostrando negocios abiertos en seguimiento";
  if (focus === "followup-overdue") return "Mostrando negocios con seguimientos vencidos";
  return null;
}

function formatFollowUpDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day} ${months[d.getMonth()]}`;
}

function getDealFollowUpIndicator(deal: CrmDeal): {
  label: string;
  dateLabel: string;
  className: string;
  dotColor: string;
} | null {
  const nextFollowUp = deal.followUpLogs?.[0];
  if (!nextFollowUp) return null;

  const dueTime = new Date(nextFollowUp.scheduledAt).getTime();
  const now = Date.now();
  const dateLabel = formatFollowUpDate(nextFollowUp.scheduledAt);

  if (dueTime <= now) {
    return {
      label: `S${nextFollowUp.sequence} vencido`,
      dateLabel,
      className: "border-red-500/30 text-red-500",
      dotColor: "bg-red-500",
    };
  }
  if (dueTime - now <= 24 * 60 * 60 * 1000) {
    return {
      label: `S${nextFollowUp.sequence} hoy`,
      dateLabel,
      className: "border-amber-500/30 text-amber-500",
      dotColor: "bg-amber-500",
    };
  }
  return {
    label: `S${nextFollowUp.sequence}`,
    dateLabel,
    className: "border-emerald-500/30 text-emerald-500",
    dotColor: "bg-emerald-500",
  };
}

type DealCardProps = {
  deal: CrmDeal;
  isOverlay?: boolean;
  onOpenSheet?: () => void;
};

type DealColumnProps = {
  stage: CrmPipelineStage;
  deals: CrmDeal[];
  stageTotal: string;
  children: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function DealColumn({ stage, deals, stageTotal, children, collapsed = false, onToggleCollapse }: DealColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.id}`,
  });

  const stageColor = stage.color || "#94a3b8";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-full rounded-lg border bg-muted/30 p-2 md:p-2.5 min-w-[250px] max-w-[280px] md:min-w-[290px] md:max-w-[290px] transition-colors overflow-hidden snap-center",
        isOver ? "border-primary/60 bg-primary/5" : "border-border"
      )}
    >
      <div
        role={onToggleCollapse ? "button" : undefined}
        tabIndex={onToggleCollapse ? 0 : undefined}
        onClick={onToggleCollapse}
        onKeyDown={onToggleCollapse ? (e) => e.key === "Enter" && onToggleCollapse() : undefined}
        className={cn(
          "w-full mb-2 rounded-md px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors",
          onToggleCollapse && "cursor-pointer hover:opacity-90 active:opacity-80"
        )}
        style={{
          borderLeft: `3px solid ${stageColor}`,
          backgroundColor: `${stageColor}10`,
        }}
      >
        <span className="text-xs font-semibold truncate flex-1 min-w-0" style={{ color: stageColor }}>
          {stage.name}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {deals.length} · {stageTotal}
        </span>
        {onToggleCollapse && (
          <span className="shrink-0 text-muted-foreground md:hidden" aria-hidden>
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}

function DealCard({
  deal,
  isOverlay = false,
  onOpenSheet,
}: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `deal-${deal.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const followUpIndicator = getDealFollowUpIndicator(deal);
  const quotesCount = (deal.quotes || []).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border border-border bg-card p-2 min-w-0 overflow-hidden transition-shadow hover:shadow-sm",
        isDragging && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div
          className="flex-1 min-w-0 cursor-pointer md:cursor-auto"
          onClick={() => !isOverlay && onOpenSheet?.()}
        >
          <Link
            href={`/crm/deals/${deal.id}`}
            className="text-[13px] font-medium text-foreground hover:underline line-clamp-1"
            onClick={(e) => e.stopPropagation()}
          >
            {deal.title}
          </Link>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {deal.account?.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs font-semibold text-primary tabular-nums">
              ${Number(deal.amount).toLocaleString("es-CL")}
            </span>
            {quotesCount > 0 && (
              <span className="text-muted-foreground" title={`${quotesCount} cotizaciones`}>
                <FileText className="h-3 w-3" />
              </span>
            )}
            {followUpIndicator && (
              <span className={cn("inline-flex items-center gap-0.5 text-[10px]", followUpIndicator.className)} title={`${followUpIndicator.label} · ${followUpIndicator.dateLabel}`}>
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", followUpIndicator.dotColor)} />
                <Clock3 className="h-2.5 w-2.5" />
              </span>
            )}
            {deal.proposalLink && (
              <a
                href={deal.proposalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary"
                onClick={(e) => e.stopPropagation()}
                title="Ver propuesta"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        {!isOverlay && (
          <button
            ref={setActivatorNodeRef}
            className="mt-0.5 rounded-md p-0.5 text-muted-foreground hover:text-foreground hidden md:block"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar negocio"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Mobile: grouped list by stage instead of horizontal kanban */
function MobileStageList({
  columns,
  collapsedStages,
  onToggleCollapse,
}: {
  columns: { stage: CrmPipelineStage; deals: CrmDeal[] }[];
  collapsedStages: Set<string>;
  onToggleCollapse: (stageId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {columns.map((column) => {
        const stageColor = column.stage.color || "#94a3b8";
        const isCollapsed = collapsedStages.has(column.stage.id);
        const stageTotal = column.deals.reduce((acc, d) => acc + Number(d.amount || 0), 0);

        return (
          <div key={column.stage.id}>
            <button
              type="button"
              onClick={() => onToggleCollapse(column.stage.id)}
              className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 transition-colors hover:bg-muted/50"
              style={{ borderLeft: `3px solid ${stageColor}` }}
            >
              <span className="text-sm font-semibold truncate" style={{ color: stageColor }}>
                {column.stage.name}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {column.deals.length} · ${stageTotal.toLocaleString("es-CL")}
                </span>
                {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>
            {!isCollapsed && (
              <div className="mt-1 space-y-1 pl-3">
                {column.deals.length === 0 && (
                  <p className="text-[11px] text-muted-foreground py-3 text-center">
                    Sin negocios en esta etapa.
                  </p>
                )}
                {column.deals.map((deal) => {
                  const followUpIndicator = getDealFollowUpIndicator(deal);
                  const quotesCount = (deal.quotes || []).length;
                  return (
                    <Link
                      key={deal.id}
                      href={`/crm/deals/${deal.id}`}
                      className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:bg-accent/30 group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{deal.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-semibold text-primary tabular-nums">
                            ${Number(deal.amount).toLocaleString("es-CL")}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {deal.account?.name}
                          </span>
                          {quotesCount > 0 && (
                            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          {followUpIndicator && (
                            <span className={cn("inline-flex items-center gap-0.5", followUpIndicator.className)}>
                              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", followUpIndicator.dotColor)} />
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Pipeline summary bar with per-stage totals */
function PipelineSummary({ columns }: { columns: { stage: CrmPipelineStage; deals: CrmDeal[] }[] }) {
  const totalAmount = columns.reduce((acc, col) => acc + col.deals.reduce((sum, d) => sum + Number(d.amount || 0), 0), 0);
  const totalDeals = columns.reduce((acc, col) => acc + col.deals.length, 0);
  if (totalDeals === 0) return null;

  return (
    <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1">
      <span className="text-xs text-muted-foreground shrink-0">
        {totalDeals} negocio{totalDeals !== 1 ? "s" : ""} · <span className="font-semibold text-foreground tabular-nums">${totalAmount.toLocaleString("es-CL")}</span>
      </span>
      <div className="hidden sm:flex items-center gap-1.5">
        {columns.map((col) => {
          if (col.deals.length === 0) return null;
          const stageColor = col.stage.color || "#94a3b8";
          const stageAmount = col.deals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
          return (
            <span
              key={col.stage.id}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 rounded-full px-2 py-0.5"
              style={{ backgroundColor: `${stageColor}15`, color: stageColor }}
            >
              {col.stage.name} ({col.deals.length}) ${stageAmount.toLocaleString("es-CL")}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function CrmDealsClient({
  initialDeals,
  accounts,
  stages,
  initialFocus = "all",
}: {
  initialDeals: CrmDeal[];
  accounts: CrmAccount[];
  stages: CrmPipelineStage[];
  initialFocus?: DealsFocus;
}) {
  const [deals, setDeals] = useState<CrmDeal[]>(initialDeals);
  const [form, setForm] = useState<DealFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [view, setView] = useLocalStorage<"kanban" | "list">("crm-deals-view", "kanban");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sort, setSort] = useState("newest");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  // Mobile sheet for deal actions
  const [sheetDealId, setSheetDealId] = useState<string | null>(null);
  const sheetDeal = sheetDealId ? deals.find((d) => d.id === sheetDealId) : null;
  const focusLabel = getDealsFocusLabel(initialFocus);

  const updateForm = (key: keyof DealFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createDeal = async () => {
    if (!form.accountId) {
      toast.error("Selecciona un cliente.");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: form.accountId,
          title: form.title,
          stageId: form.stageId || undefined,
          amount: form.amount ? Number(form.amount) : 0,
          probability: form.probability ? Number(form.probability) : 0,
          expectedCloseDate: form.expectedCloseDate || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error creando negocio");
      }
      setDeals((prev) => [payload.data, ...prev]);
      setForm(DEFAULT_FORM);
      setOpen(false);
      toast.success("Negocio creado exitosamente");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear el negocio.");
    } finally {
      setCreating(false);
    }
  };

  const updateStage = async (dealId: string, stageId: string) => {
    if (!stageId) return;
    const current = deals.find((deal) => deal.id === dealId);
    if (!current || current.stage?.id === stageId) return;

    const nextStage = stages.find((stage) => stage.id === stageId);
    const snapshot = JSON.parse(JSON.stringify(current)) as CrmDeal;

    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId && nextStage
          ? { ...deal, stage: nextStage, status: nextStage.isClosedWon ? "won" : nextStage.isClosedLost ? "lost" : "open" }
          : deal
      )
    );

    try {
      const response = await fetch(`/api/crm/deals/${dealId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error cambiando etapa");
      }
      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? payload.data : deal)));
    } catch (error) {
      console.error(error);
      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? snapshot : deal)));
      toast.error("No se pudo actualizar la etapa.");
    }
  };

  const filteredDeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = deals.filter((deal) => {
      if (stageFilter !== "all" && deal.stage?.id !== stageFilter) return false;
      if (q) {
        const searchable = `${deal.title} ${deal.account?.name || ""} ${deal.primaryContact?.firstName || ""} ${deal.primaryContact?.lastName || ""}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      switch (sort) {
        case "oldest":
          return aTime - bTime;
        case "az":
          return (a.title || "").localeCompare(b.title || "");
        case "za":
          return (b.title || "").localeCompare(a.title || "");
        case "newest":
        default:
          return bTime - aTime;
      }
    });

    return result;
  }, [deals, stageFilter, search, sort]);

  const columns = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      deals: filteredDeals.filter((deal) => deal.stage?.id === stage.id),
    }));
  }, [filteredDeals, stages]);

  const stageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    deals.forEach((d) => {
      if (d.stage?.id) {
        map[d.stage.id] = (map[d.stage.id] || 0) + 1;
      }
    });
    return map;
  }, [deals]);

  const stageFilterOptions = useMemo(() => [
    { key: "all", label: "Todos", count: deals.length },
    ...stages.map((stage) => ({
      key: stage.id,
      label: stage.name,
      count: stageCounts[stage.id] || 0,
    })),
  ], [deals.length, stages, stageCounts]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 5 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const dealId = String(event.active.id).replace("deal-", "");
    setActiveDealId(dealId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      setActiveDealId(null);
      return;
    }

    const dealId = String(active.id).replace("deal-", "");
    const overId = String(over.id);
    const stageId = overId.startsWith("stage-")
      ? overId.replace("stage-", "")
      : deals.find((deal) => `deal-${deal.id}` === overId)?.stage?.id;

    if (stageId) {
      updateStage(dealId, stageId);
    }
    setActiveDealId(null);
  };

  const handleDragCancel = () => {
    setActiveDealId(null);
  };

  const toggleStageCollapse = (stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const dropAnimation = {
    duration: 220,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0.6" } },
    }),
  };

  return (
    <div className="space-y-3">
      {focusLabel && (
        <p className="text-xs text-muted-foreground">{focusLabel}</p>
      )}

      {/* ── Toolbar ── */}
      <CrmToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por título, cuenta o contacto..."
        filters={stageFilterOptions}
        activeFilter={stageFilter}
        onFilterChange={setStageFilter}
        activeSort={sort}
        onSortChange={setSort}
        viewModes={["kanban", "list"]}
        activeView={view as ViewMode}
        onViewChange={(v) => setView(v as "kanban" | "list")}
        actionSlot={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="sr-only">Nuevo negocio</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuevo negocio</DialogTitle>
                <DialogDescription>
                  Crea una oportunidad y asigna cliente.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Cliente</Label>
                  <Select value={form.accountId} onValueChange={(v) => updateForm("accountId", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Título</Label>
                  <Input
                    value={form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                    placeholder="Oportunidad para..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Etapa</Label>
                  <Select value={form.stageId} onValueChange={(v) => updateForm("stageId", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Etapa por defecto" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monto (CLP)</Label>
                  <Input
                    value={form.amount}
                    onChange={(event) => updateForm("amount", event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Probabilidad (%)</Label>
                  <Input
                    value={form.probability}
                    onChange={(event) => updateForm("probability", event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cierre estimado</Label>
                  <Input
                    type="date"
                    value={form.expectedCloseDate}
                    onChange={(event) =>
                      updateForm("expectedCloseDate", event.target.value)
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createDeal} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar negocio
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* ── Pipeline summary ── */}
      {view === "kanban" && <PipelineSummary columns={columns} />}

      {view === "kanban" ? (
        <>
          {deals.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-8 w-8" />}
              title="Sin negocios"
              description="No hay negocios creados todavía."
              compact
            />
          ) : filteredDeals.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-8 w-8" />}
              title="Sin resultados"
              description="No hay negocios para los filtros o búsqueda seleccionados."
              compact
            />
          ) : (
            <>
              {/* Mobile: vertical grouped list */}
              <div className="md:hidden">
                <MobileStageList
                  columns={columns}
                  collapsedStages={collapsedStages}
                  onToggleCollapse={toggleStageCollapse}
                />
              </div>

              {/* Desktop: horizontal kanban */}
              <div className="hidden md:block">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragCancel={handleDragCancel}
                >
                  <div className="flex flex-row gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                    {columns.map((column) => {
                      const stageTotal = column.deals.reduce((acc, d) => acc + Number(d.amount || 0), 0);
                      return (
                        <DealColumn
                          key={column.stage.id}
                          stage={column.stage}
                          deals={column.deals}
                          stageTotal={`$${stageTotal.toLocaleString("es-CL")}`}
                          collapsed={collapsedStages.has(column.stage.id)}
                          onToggleCollapse={() => toggleStageCollapse(column.stage.id)}
                        >
                          <SortableContext
                            items={column.deals.map((deal) => `deal-${deal.id}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-1.5">
                              {column.deals.length === 0 && (
                                <p className="text-[11px] text-muted-foreground text-center py-4">
                                  Sin negocios en esta etapa.
                                </p>
                              )}
                              {column.deals.map((deal) => (
                                <DealCard
                                  key={deal.id}
                                  deal={deal}
                                  onOpenSheet={() => setSheetDealId(deal.id)}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DealColumn>
                      );
                    })}
                  </div>
                  <DragOverlay dropAnimation={dropAnimation}>
                    {activeDealId ? (
                      <DealCard
                        deal={deals.find((deal) => deal.id === activeDealId)!}
                        isOverlay
                      />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-0">
            {filteredDeals.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<TrendingUp className="h-8 w-8" />}
                  title="Sin negocios"
                  description={
                    search || stageFilter !== "all"
                      ? "No hay negocios para los filtros seleccionados."
                      : "No hay negocios creados todavía."
                  }
                  compact
                />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredDeals.map((deal) => {
                  const followUpIndicator = getDealFollowUpIndicator(deal);
                  const stageColor = deal.stage?.color || "#94a3b8";
                  const quotesCount = (deal.quotes || []).length;
                  return (
                    <Link
                      key={deal.id}
                      href={`/crm/deals/${deal.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 md:px-4 md:py-3 transition-colors hover:bg-accent/30 group"
                    >
                      <div
                        className="w-0.5 self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: stageColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{deal.title}</p>
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 shrink-0"
                            style={{ borderColor: `${stageColor}40`, color: stageColor }}
                          >
                            {deal.stage?.name}
                          </Badge>
                          {quotesCount > 0 && (
                            <span className="text-muted-foreground shrink-0" title={`${quotesCount} CPQ`}>
                              <FileText className="h-3 w-3" />
                            </span>
                          )}
                          {followUpIndicator && (
                            <span className={cn("inline-flex items-center gap-0.5 shrink-0", followUpIndicator.className)} title={`${followUpIndicator.label} · ${followUpIndicator.dateLabel}`}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", followUpIndicator.dotColor)} />
                              <Clock3 className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {deal.account?.name}
                          {deal.primaryContact && ` · ${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim()}
                          {" · "}
                          <span className="font-medium text-foreground tabular-nums">
                            ${Number(deal.amount).toLocaleString("es-CL")}
                          </span>
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 shrink-0 hidden sm:block" />
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Mobile Deal Actions Sheet ── */}
      <Sheet open={!!sheetDealId} onOpenChange={(o) => !o && setSheetDealId(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          {sheetDeal && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="text-base">{sheetDeal.title}</SheetTitle>
                <SheetDescription>
                  {sheetDeal.account?.name} · <span className="font-semibold text-foreground tabular-nums">${Number(sheetDeal.amount).toLocaleString("es-CL")}</span>
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                {/* Quick stage change */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Etapa</Label>
                  <Select
                    value={sheetDeal.stage?.id || ""}
                    onValueChange={(stageId) => {
                      updateStage(sheetDeal.id, stageId);
                      setSheetDealId(null);
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Selecciona etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Link
                  href={`/crm/deals/${sheetDeal.id}`}
                  className="flex items-center justify-center rounded-md border border-border bg-accent/30 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                  onClick={() => setSheetDealId(null)}
                >
                  Ver detalle completo
                </Link>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
