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
  defaultAnimateLayoutChanges,
  AnimateLayoutChanges,
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
import { cn } from "@/lib/utils";
import { CrmAccount, CrmDeal, CrmPipelineStage } from "@/types";
import { GripVertical, Plus } from "lucide-react";

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

type DealCardProps = {
  deal: CrmDeal;
  stages: CrmPipelineStage[];
  quotes: QuoteOption[];
  quotesById: Record<string, QuoteOption>;
  selectedQuoteId: string;
  onSelectQuote: (value: string) => void;
  onLinkQuote: () => void;
  onStageChange: (stageId: string) => void;
  loading: boolean;
  isOverlay?: boolean;
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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-full rounded-lg border bg-muted/30 p-3 md:min-w-[260px] md:max-w-[260px] transition-colors",
        isOver ? "border-primary/60" : "border-border"
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{stage.name}</div>
        <Badge variant="outline">{deals.length}</Badge>
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
  loading,
  isOverlay = false,
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-border bg-card p-3",
        isDragging && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Link
            href={`/crm/deals/${deal.id}`}
            className="text-sm font-semibold text-foreground hover:underline"
          >
            {deal.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {deal.account?.name} · {deal.primaryContact?.name || "Sin contacto"}
          </p>
          <p className="text-xs text-muted-foreground">
            ${Number(deal.amount).toLocaleString("es-CL")}
          </p>
        </div>
        {!isOverlay && (
          <button
            ref={setActivatorNodeRef}
            className="mt-0.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar negocio"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      {!isOverlay && (
        <>
          <div className="mt-3 space-y-2">
        <Label className="text-xs">Cambiar etapa</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={deal.stage?.id || ""}
          onChange={(event) => onStageChange(event.target.value)}
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
        <div className="flex flex-wrap gap-2">
          {(deal.quotes || []).length === 0 && (
            <span className="text-xs text-muted-foreground">
              Sin cotizaciones vinculadas.
            </span>
          )}
          {(deal.quotes || []).map((quote) => {
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
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={selectedQuoteId}
            onChange={(event) => onSelectQuote(event.target.value)}
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
            disabled={loading}
          >
            Vincular
          </Button>
        </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CrmDealsClient({
  initialDeals,
  accounts,
  stages,
  quotes,
}: {
  initialDeals: CrmDeal[];
  accounts: CrmAccount[];
  stages: CrmPipelineStage[];
  quotes: QuoteOption[];
}) {
  const [deals, setDeals] = useState<CrmDeal[]>(initialDeals);
  const [form, setForm] = useState<DealFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [filters, setFilters] = useState({
    stageId: "",
    accountId: "",
  });
  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const updateForm = (key: keyof DealFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createDeal = async () => {
    if (!form.accountId) {
      alert("Selecciona un cliente.");
      return;
    }
    setLoading(true);
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
    } catch (error) {
      console.error(error);
      alert("No se pudo crear el negocio.");
    } finally {
      setLoading(false);
    }
  };

  const updateStage = async (dealId: string, stageId: string) => {
    if (!stageId) return;
    const current = deals.find((deal) => deal.id === dealId);
    if (!current || current.stage?.id === stageId) return;

    const nextStage = stages.find((stage) => stage.id === stageId);
    const previous = current;

    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId && nextStage
          ? { ...deal, stage: nextStage, status: nextStage.isClosedWon ? "won" : nextStage.isClosedLost ? "lost" : "open" }
          : deal
      )
    );

    setLoading(true);
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
      setDeals((prev) => prev.map((deal) => (deal.id === dealId ? previous : deal)));
      alert("No se pudo actualizar la etapa.");
    } finally {
      setLoading(false);
    }
  };

  const linkQuote = async (dealId: string) => {
    const quoteId = selectedQuotes[dealId];
    if (!quoteId) {
      alert("Selecciona una cotización.");
      return;
    }
    setLoading(true);
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
    } catch (error) {
      console.error(error);
      alert("No se pudo vincular la cotización.");
    } finally {
      setLoading(false);
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
    return deals.filter((deal) => {
      if (filters.stageId && deal.stage?.id !== filters.stageId) return false;
      if (filters.accountId && deal.account?.id !== filters.accountId) return false;
      return true;
    });
  }, [deals, filters]);

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
    if (!over) return;

    const dealId = String(active.id).replace("deal-", "");
    const overId = String(over.id);
    const stageId = overId.startsWith("stage-")
      ? overId.replace("stage-", "")
      : deals.find((deal) => `deal-${deal.id}` === overId)?.stage?.id;

    if (!stageId) return;
    updateStage(dealId, stageId);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Negocios activos y etapa actual.
        </p>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border p-0.5 text-xs">
            <button
              type="button"
              className={`rounded-full px-2 py-1 ${
                view === "kanban"
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground"
              }`}
              onClick={() => setView("kanban")}
            >
              Kanban
            </button>
            <button
              type="button"
              className={`rounded-full px-2 py-1 ${
                view === "list"
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground"
              }`}
              onClick={() => setView("list")}
            >
              Lista
            </button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-9 w-9">
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
                <Button onClick={createDeal} disabled={loading}>
                  Guardar negocio
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === "kanban" ? (
        <Card>
          <CardHeader>
            <CardTitle>Kanban de negocios</CardTitle>
            <CardDescription>Vista por etapas optimizada para móvil.</CardDescription>
          </CardHeader>
          <CardContent>
            {deals.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay negocios creados todavía.
              </p>
            )}
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
                          <p className="text-xs text-muted-foreground">
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
                            loading={loading}
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
                    loading={false}
                    isOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Lista de negocios</CardTitle>
            <CardDescription>Vista compacta por cliente y etapa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className={selectClassName}
                value={filters.stageId}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, stageId: event.target.value }))
                }
              >
                <option value="">Todas las etapas</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClassName}
                value={filters.accountId}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, accountId: event.target.value }))
                }
              >
                <option value="">Todos los clientes</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            {filteredDeals.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay negocios creados todavía.
              </p>
            )}
            {filteredDeals.map((deal) => (
              <div
                key={deal.id}
                className="flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/crm/deals/${deal.id}`}
                      className="text-sm font-semibold text-foreground hover:underline"
                    >
                      {deal.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {deal.account?.name} · {deal.primaryContact?.name || "Sin contacto"}
                    </p>
                  </div>
                  <Badge variant="outline">{deal.stage?.name}</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>${Number(deal.amount).toLocaleString("es-CL")}</span>
                  <Link
                    href={`/crm/deals/${deal.id}`}
                    className="text-xs text-foreground/70 hover:text-foreground"
                  >
                    Ver detalle
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
