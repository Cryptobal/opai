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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { CrmDates } from "@/components/crm/CrmDates";
import { EmptyState } from "@/components/opai/EmptyState";
import { GripVertical, Loader2, Plus, ExternalLink, TrendingUp, ChevronRight } from "lucide-react";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "./ViewToggle";
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

type QuoteOption = {
  id: string;
  code: string;
  clientName?: string | null;
  status: string;
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

function getDealFollowUpIndicator(deal: CrmDeal): {
  label: string;
  className: string;
} | null {
  const nextFollowUp = deal.followUpLogs?.[0];
  if (!nextFollowUp) return null;

  const dueTime = new Date(nextFollowUp.scheduledAt).getTime();
  const now = Date.now();

  if (dueTime <= now) {
    return {
      label: `Seg. ${nextFollowUp.sequence} vencido`,
      className: "border-red-500/30 text-red-500",
    };
  }
  if (dueTime - now <= 24 * 60 * 60 * 1000) {
    return {
      label: `Seg. ${nextFollowUp.sequence} hoy`,
      className: "border-amber-500/30 text-amber-500",
    };
  }
  return {
    label: `Seg. ${nextFollowUp.sequence} programado`,
    className: "border-emerald-500/30 text-emerald-500",
  };
}

type DealCardProps = {
  deal: CrmDeal;
  stages: CrmPipelineStage[];
  quotes: QuoteOption[];
  quotesById: Record<string, QuoteOption>;
  selectedQuoteId: string;
  onSelectQuote: (value: string) => void;
  onLinkQuote: () => void;
  onStageChange: (stageId: string) => void;
  isLinking: boolean;
  isChangingStage: boolean;
  isOverlay?: boolean;
  onOpenSheet?: () => void;
};

type DealColumnProps = {
  stage: CrmPipelineStage;
  deals: CrmDeal[];
  children: ReactNode;
};

function DealColumn({ stage, deals, children }: DealColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.id}`,
  });

  const stageColor = stage.color || "#94a3b8";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-full rounded-lg border bg-muted/30 p-3 md:min-w-[260px] md:max-w-[260px] transition-colors min-w-0 overflow-hidden",
        isOver ? "border-primary/60" : "border-border"
      )}
    >
      <div
        className="mb-3 rounded-lg border px-3 py-2 flex items-center justify-between gap-2"
        style={{
          borderColor: stageColor,
          backgroundColor: `${stageColor}18`,
        }}
      >
        <span className="text-sm font-semibold truncate" style={{ color: stageColor }}>
          {stage.name}
        </span>
        <Badge variant="secondary" className="shrink-0 text-xs font-medium tabular-nums">
          {deals.length}
        </Badge>
      </div>
      {children}
    </div>
  );
}

function DealCard({
  deal,
  stages,
  quotes,
  quotesById,
  selectedQuoteId,
  onSelectQuote,
  onLinkQuote,
  onStageChange,
  isLinking,
  isChangingStage,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-border bg-card p-3 min-w-0 overflow-hidden",
        isDragging && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex-1 space-y-1 cursor-pointer md:cursor-auto"
          onClick={() => !isOverlay && onOpenSheet?.()}
        >
          <Link
            href={`/crm/deals/${deal.id}`}
            className="text-sm font-semibold text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {deal.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {deal.account?.name} · {deal.primaryContact ? `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim() : "Sin contacto"}
          </p>
          {deal.createdAt && (
            <CrmDates
              createdAt={deal.createdAt}
              updatedAt={(deal as { updatedAt?: string }).updatedAt}
              className="mt-0.5"
            />
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              ${Number(deal.amount).toLocaleString("es-CL")}
            </span>
            {(deal.quotes || []).length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4">
                {(deal.quotes || []).length} CPQ
              </Badge>
            )}
            {followUpIndicator && (
              <Badge
                variant="outline"
                className={`text-[10px] h-4 ${followUpIndicator.className}`}
              >
                {followUpIndicator.label}
              </Badge>
            )}
            {deal.proposalLink && (
              <a
                href={deal.proposalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Propuesta
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        {!isOverlay && (
          <button
            ref={setActivatorNodeRef}
            className="mt-0.5 rounded-md p-1 text-muted-foreground hover:text-foreground hidden md:block"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar negocio"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Desktop-only inline actions */}
      {!isOverlay && (
        <div className="hidden md:block">
          <div className="mt-3 space-y-2">
            <Label className="text-xs">Cambiar etapa</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              value={deal.stage?.id || ""}
              onChange={(event) => onStageChange(event.target.value)}
              disabled={isChangingStage}
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 space-y-2">
            <Label className="text-xs">Cotizaciones</Label>
            <div className="flex flex-wrap gap-1">
              {(deal.quotes || []).length === 0 && (
                <span className="text-xs text-muted-foreground">
                  Sin cotizaciones.
                </span>
              )}
              {(deal.quotes || []).map((quote) => {
                const quoteInfo = quotesById[quote.quoteId];
                return (
                  <Badge key={quote.id} variant="outline" className="text-[10px]">
                    {quoteInfo?.code || "CPQ"}
                  </Badge>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                value={selectedQuoteId}
                onChange={(event) => onSelectQuote(event.target.value)}
                disabled={isLinking}
              >
                <option value="">Selecciona cotización</option>
                {quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    {quote.code} · {quote.clientName || "Sin cliente"}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={onLinkQuote}
                disabled={isLinking}
              >
                {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Vincular"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CrmDealsClient({
  initialDeals,
  accounts,
  stages,
  quotes,
  initialFocus = "all",
}: {
  initialDeals: CrmDeal[];
  accounts: CrmAccount[];
  stages: CrmPipelineStage[];
  quotes: QuoteOption[];
  initialFocus?: DealsFocus;
}) {
  const [deals, setDeals] = useState<CrmDeal[]>(initialDeals);
  const [form, setForm] = useState<DealFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [view, setView] = useLocalStorage<"kanban" | "list">("crm-deals-view", "kanban");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sort, setSort] = useState("newest");
  // Per-deal loading states
  const [linkingDealId, setLinkingDealId] = useState<string | null>(null);
  const [changingStageId, setChangingStageId] = useState<string | null>(null);
  // Mobile sheet for deal actions
  const [sheetDealId, setSheetDealId] = useState<string | null>(null);
  const sheetDeal = sheetDealId ? deals.find((d) => d.id === sheetDealId) : null;
  const focusLabel = getDealsFocusLabel(initialFocus);

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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

    setChangingStageId(dealId);
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
    } finally {
      setChangingStageId(null);
    }
  };

  const linkQuote = async (dealId: string) => {
    const quoteId = selectedQuotes[dealId];
    if (!quoteId) {
      toast.error("Selecciona una cotización.");
      return;
    }
    setLinkingDealId(dealId);
    try {
      const response = await fetch(`/api/crm/deals/${dealId}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Error vinculando cotización");
      }
      setDeals((prev) =>
        prev.map((deal) =>
          deal.id === dealId
            ? { ...deal, quotes: [...(deal.quotes || []), payload.data] }
            : deal
        )
      );
      setSelectedQuotes((prev) => ({ ...prev, [dealId]: "" }));
      toast.success("Cotización vinculada exitosamente");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo vincular la cotización.");
    } finally {
      setLinkingDealId(null);
    }
  };

  const quotesById = useMemo(() => {
    return quotes.reduce<Record<string, QuoteOption>>((acc, quote) => {
      acc[quote.id] = quote;
      return acc;
    }, {});
  }, [quotes]);

  const columns = useMemo(() => {
    return stages.map((stage) => ({
      stage,
      deals: deals.filter((deal) => deal.stage?.id === stage.id),
    }));
  }, [deals, stages]);

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
      switch (sort) {
        case "oldest":
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "az":
          return (a.title || "").localeCompare(b.title || "");
        case "za":
          return (b.title || "").localeCompare(a.title || "");
        case "newest":
        default:
          return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
    });

    return result;
  }, [deals, stageFilter, search, sort]);

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

  const dropAnimation = {
    duration: 220,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0.6" } },
    }),
  };

  return (
    <div className="space-y-4">
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
                  <select
                    className={selectClassName}
                    value={form.accountId}
                    onChange={(event) => updateForm("accountId", event.target.value)}
                  >
                    <option value="">Selecciona un cliente</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Título</Label>
                  <Input
                    value={form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                    placeholder="Oportunidad para..."
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Etapa</Label>
                  <select
                    className={selectClassName}
                    value={form.stageId}
                    onChange={(event) => updateForm("stageId", event.target.value)}
                  >
                    <option value="">Etapa por defecto</option>
                    {stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Monto (CLP)</Label>
                  <Input
                    value={form.amount}
                    onChange={(event) => updateForm("amount", event.target.value)}
                    placeholder="0"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Probabilidad (%)</Label>
                  <Input
                    value={form.probability}
                    onChange={(event) => updateForm("probability", event.target.value)}
                    placeholder="0"
                    className={inputClassName}
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
                    className={inputClassName}
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

      {view === "kanban" ? (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>Arrastra los negocios entre etapas.</CardDescription>
          </CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <EmptyState
                icon={<TrendingUp className="h-8 w-8" />}
                title="Sin negocios"
                description="No hay negocios creados todavía."
                compact
              />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <div className="flex flex-col gap-4 md:flex-row md:gap-4 md:overflow-x-auto">
                  {columns.map((column) => (
                    <DealColumn
                      key={column.stage.id}
                      stage={column.stage}
                      deals={column.deals}
                    >
                      <SortableContext
                        items={column.deals.map((deal) => `deal-${deal.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {column.deals.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              Sin negocios en esta etapa.
                            </p>
                          )}
                          {column.deals.map((deal) => (
                            <DealCard
                              key={deal.id}
                              deal={deal}
                              stages={stages}
                              quotes={quotes}
                              quotesById={quotesById}
                              selectedQuoteId={selectedQuotes[deal.id] || ""}
                              onSelectQuote={(value) =>
                                setSelectedQuotes((prev) => ({
                                  ...prev,
                                  [deal.id]: value,
                                }))
                              }
                              onLinkQuote={() => linkQuote(deal.id)}
                              onStageChange={(stageId) => updateStage(deal.id, stageId)}
                              isLinking={linkingDealId === deal.id}
                              isChangingStage={changingStageId === deal.id}
                              onOpenSheet={() => setSheetDealId(deal.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DealColumn>
                  ))}
                </div>
                <DragOverlay dropAnimation={dropAnimation}>
                  {activeDealId ? (
                    <DealCard
                      deal={deals.find((deal) => deal.id === activeDealId)!}
                      stages={stages}
                      quotes={quotes}
                      quotesById={quotesById}
                      selectedQuoteId=""
                      onSelectQuote={() => {}}
                      onLinkQuote={() => {}}
                      onStageChange={() => {}}
                      isLinking={false}
                      isChangingStage={false}
                      isOverlay
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-5">
            {filteredDeals.length === 0 ? (
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
            ) : (
              <div className="space-y-2">
                {filteredDeals.map((deal) => {
                  const followUpIndicator = getDealFollowUpIndicator(deal);
                  return (
                  <Link
                    key={deal.id}
                    href={`/crm/deals/${deal.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{deal.title}</p>
                        <Badge variant="outline">{deal.stage?.name}</Badge>
                        {(deal.quotes || []).length > 0 && (
                          <Badge variant="outline" className="text-[10px] h-4">
                            {(deal.quotes || []).length} CPQ
                          </Badge>
                        )}
                        {followUpIndicator && (
                          <Badge variant="outline" className={`text-[10px] h-4 ${followUpIndicator.className}`}>
                            {followUpIndicator.label}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {deal.account?.name} · {deal.primaryContact ? `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim() : "Sin contacto"}
                        {" · "}${Number(deal.amount).toLocaleString("es-CL")}
                      </p>
                      {deal.createdAt && (
                        <CrmDates
                          createdAt={deal.createdAt}
                          updatedAt={(deal as { updatedAt?: string }).updatedAt}
                          className="mt-0.5"
                        />
                      )}
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
                <SheetTitle>{sheetDeal.title}</SheetTitle>
                <SheetDescription>
                  {sheetDeal.account?.name} · ${Number(sheetDeal.amount).toLocaleString("es-CL")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cambiar etapa
                  </Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                    value={sheetDeal.stage?.id || ""}
                    onChange={(event) => {
                      updateStage(sheetDeal.id, event.target.value);
                      setSheetDealId(null);
                    }}
                  >
                    {stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-border" />

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Cotizaciones vinculadas
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {(sheetDeal.quotes || []).length === 0 && (
                      <span className="text-xs text-muted-foreground">Sin cotizaciones.</span>
                    )}
                    {(sheetDeal.quotes || []).map((quote) => {
                      const quoteInfo = quotesById[quote.quoteId];
                      return (
                        <Badge key={quote.id} variant="outline">
                          {quoteInfo?.code || "CPQ"}
                        </Badge>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      value={selectedQuotes[sheetDeal.id] || ""}
                      onChange={(event) =>
                        setSelectedQuotes((prev) => ({
                          ...prev,
                          [sheetDeal.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Selecciona cotización</option>
                      {quotes.map((quote) => (
                        <option key={quote.id} value={quote.id}>
                          {quote.code} · {quote.clientName || "Sin cliente"}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        linkQuote(sheetDeal.id);
                        setSheetDealId(null);
                      }}
                      disabled={linkingDealId === sheetDeal.id}
                    >
                      {linkingDealId === sheetDeal.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Vincular"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border" />

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
