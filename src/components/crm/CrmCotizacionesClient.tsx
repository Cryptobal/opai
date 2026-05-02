"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Stat } from "@/components/opai-ds";
import { FileText, ChevronRight, Plus, Loader2, MessageSquare, ExternalLink, CalendarClock, Zap } from "lucide-react";
import { formatCLP, formatNumber, formatUFSuffix } from "@/lib/utils";
import { clpToUf } from "@/lib/uf-utils";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";
import { toast } from "sonner";
import { useUnreadNoteIds } from "@/lib/hooks";

type QuoteRow = {
  id: string;
  code: string;
  name?: string | null;
  status: string;
  clientName?: string | null;
  monthlyCost: string | number;
  salePriceMonthly: string | number;
  marginPct?: number;
  currency: string;
  totalPositions: number;
  totalGuards: number;
  createdAt: string;
  updatedAt?: string | null;
  accountId?: string | null;
  dealId?: string | null;
  dealTitle?: string | null;
  accountName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  dealStageName?: string | null;
  dealStageColor?: string | null;
  pendingFollowUps?: number;
  createdFromLeadId?: string | null;
};

type AccountRow = {
  id: string;
  name: string;
};

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "border-status-warn-border text-status-warn-fg dark:text-status-warn-fg bg-status-warn-soft" },
  sent: { label: "Enviada", className: "border-status-info-border text-status-info-fg dark:text-status-info-fg" },
  approved: { label: "Aprobada", className: "border-status-ok-border text-status-ok-fg dark:text-status-ok-fg" },
  rejected: { label: "Rechazada", className: "border-status-danger-border text-status-danger-fg dark:text-status-danger-fg" },
};

export function CrmCotizacionesClient({
  quotes,
  accounts,
  ufValue,
}: {
  quotes: QuoteRow[];
  accounts: AccountRow[];
  ufValue: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [sort, setSort] = useState("newest");
  const [creating, setCreating] = useState(false);
  const unreadNoteIds = useUnreadNoteIds("QUOTATION");

  const createQuote = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/cpq/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "No se pudo crear la cotización.");
      toast.success(`Cotización ${payload.data.code} creada`);
      router.push(`/crm/cotizaciones/${payload.data.id}`);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo crear la cotización.");
    } finally {
      setCreating(false);
    }
  };

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = quotes.filter((quote) => {
      if (statusFilter !== "all" && quote.status !== statusFilter) return false;
      if (accountFilter !== "all") {
        const matchesAccount = quote.clientName?.toLowerCase() === accounts.find((a) => a.id === accountFilter)?.name.toLowerCase();
        if (!matchesAccount) return false;
      }
      if (q && !`${quote.code} ${quote.name || ""} ${quote.clientName || ""} ${quote.dealTitle || ""} ${quote.accountName || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return (a.createdAt || "").localeCompare(b.createdAt || "");
        case "az":
          return (a.code || "").localeCompare(b.code || "");
        case "za":
          return (b.code || "").localeCompare(a.code || "");
        case "newest":
        default:
          return (b.createdAt || "").localeCompare(a.createdAt || "");
      }
    });

    return result;
  }, [quotes, search, statusFilter, accountFilter, accounts, sort]);

  const counts = useMemo(() => ({
    total: quotes.length,
    draft: quotes.filter((q) => q.status === "draft").length,
    sent: quotes.filter((q) => q.status === "sent").length,
    approved: quotes.filter((q) => q.status === "approved").length,
    rejected: quotes.filter((q) => q.status === "rejected").length,
  }), [quotes]);

  const statusFilters = [
    { key: "all", label: "Todas", count: counts.total },
    { key: "draft", label: "Borrador", count: counts.draft, activeVariant: "amber" as const },
    { key: "sent", label: "Enviadas", count: counts.sent, activeVariant: "blue" as const },
    { key: "approved", label: "Aprobadas", count: counts.approved, activeVariant: "emerald" as const },
    { key: "rejected", label: "Rechazadas", count: counts.rejected, activeVariant: "red" as const },
  ];

  return (
    <div className="space-y-4">
      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={String(counts.total)} />
        <Stat label="Borradores" value={String(counts.draft)} variant="warn" />
        <Stat label="Enviadas" value={String(counts.sent)} variant="brand" />
        <Stat label="Aprobadas" value={String(counts.approved)} variant="ok" />
      </div>

      {/* ── Toolbar ── */}
      <CrmToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por código, cliente o negocio..."
        filters={statusFilters}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
        activeSort={sort}
        onSortChange={setSort}
        viewModes={["list", "cards"]}
        activeView={viewMode}
        onViewChange={(v) => setViewMode(v as ViewMode)}
        actionSlot={
          <Button
            size="icon"
            variant="secondary"
            className="h-9 w-9 shrink-0"
            onClick={createQuote}
            disabled={creating}
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="sr-only">Nueva cotización</span>
          </Button>
        }
      />

      {/* ── Quote list / cards ── */}
      <Card>
        <CardContent className="pt-5">
          {filteredQuotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Sin cotizaciones"
              description={
                search || statusFilter !== "all"
                  ? "No hay cotizaciones para los filtros seleccionados."
                  : "Crea tu primera cotización desde el módulo CPQ."
              }
              action={
                <Button size="sm" variant="outline" onClick={createQuote} disabled={creating}>
                  {creating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Nueva cotización
                </Button>
              }
              compact
            />
          ) : viewMode === "list" ? (
            <div className="space-y-2 min-w-0">
              {filteredQuotes.map((quote) => (
                <QuoteListRow key={quote.id} quote={quote} ufValue={ufValue} hasUnreadNotes={unreadNoteIds.has(quote.id)} />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {filteredQuotes.map((quote) => (
                <QuoteCardItem key={quote.id} quote={quote} ufValue={ufValue} hasUnreadNotes={unreadNoteIds.has(quote.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── List row ── */
function QuoteListRow({ quote, ufValue, hasUnreadNotes }: { quote: QuoteRow; ufValue: number; hasUnreadNotes?: boolean }) {
  const status = STATUS_MAP[quote.status] || STATUS_MAP.draft;
  const salePriceClp = Number(quote.salePriceMonthly);
  const salePriceUf = ufValue > 0 ? formatUFSuffix(clpToUf(salePriceClp, ufValue)) : null;
  return (
    <Link
      href={`/crm/cotizaciones/${quote.id}`}
      className="flex items-center justify-between rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group min-w-0 overflow-hidden"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{quote.code}</span>
          {quote.name && <span className="text-sm text-foreground truncate">{quote.name}</span>}
          {hasUnreadNotes && (
            <span className="relative shrink-0" title="Notas no leídas">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
            </span>
          )}
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
          {quote.createdFromLeadId && (
            <Link
              href={`/crm/leads/${quote.createdFromLeadId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-status-info-border text-status-info-fg hover:bg-status-info-soft transition-colors cursor-pointer">
                <Zap className="h-3 w-3" />
                Desde Lead
              </Badge>
            </Link>
          )}
          {quote.dealStageName && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
              {quote.dealStageColor && (
                <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: quote.dealStageColor }} />
              )}
              {quote.dealStageName}
            </Badge>
          )}
          {(quote.pendingFollowUps ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-violet-500/30 text-violet-600 dark:text-violet-400">
              <CalendarClock className="h-3 w-3" />
              Seguimiento
            </Badge>
          )}
        </div>
        {quote.dealTitle && (
          <p className="mt-0.5 text-sm truncate">
            {quote.dealId ? (
              <Link
                href={`/crm/deals/${quote.dealId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-status-info-fg hover:underline inline-flex items-center gap-1 transition-colors"
              >
                {quote.dealTitle}
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ) : (
              <span className="text-foreground">{quote.dealTitle}</span>
            )}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground truncate flex items-center gap-1">
          {quote.accountId ? (
            <Link
              href={`/crm/accounts/${quote.accountId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-status-info-fg hover:text-status-ok-fg hover:underline transition-colors"
            >
              {quote.accountName || quote.clientName || "Sin cliente"}
            </Link>
          ) : (
            <span>{quote.accountName || quote.clientName || "Sin cliente"}</span>
          )}
          {quote.contactName && (
            <>
              <span>·</span>
              <Link
                href={`/crm/contacts/${quote.contactId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-status-info-fg hover:text-status-info-fg hover:underline transition-colors"
              >
                {quote.contactName}
              </Link>
            </>
          )}
          <span>· {quote.totalGuards} guardias · {quote.totalPositions} puestos</span>
        </p>
        <CrmDates createdAt={quote.createdAt} updatedAt={quote.updatedAt} className="mt-0.5" />
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-md border border-border/50 bg-muted/15 p-2 text-center sm:hidden">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">P. venta</p>
            <p className="truncate text-xs font-medium font-mono">{formatCLP(salePriceClp)}</p>
            {salePriceUf ? <p className="truncate text-[10px] font-semibold text-muted-foreground">{salePriceUf}</p> : null}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Costo</p>
            <p className="truncate text-xs font-mono">{formatCLP(Number(quote.monthlyCost))}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Margen</p>
            <p className="truncate text-xs font-medium font-mono text-status-ok-fg dark:text-status-ok-fg">
              {quote.marginPct != null
                ? `${formatNumber(quote.marginPct, { minDecimals: 1, maxDecimals: 1 })}%`
                : "—"}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-3 text-right">
        <div className="text-xs hidden sm:block">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">P. venta</p>
          <p className="text-sm font-medium font-mono">{formatCLP(salePriceClp)}</p>
          {salePriceUf ? (
            <p className="text-[10px] font-semibold text-muted-foreground">{salePriceUf}</p>
          ) : null}
        </div>
        <div className="text-xs hidden sm:block">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Costo</p>
          <p className="text-sm font-mono">{formatCLP(Number(quote.monthlyCost))}</p>
        </div>
        <div className="text-xs hidden sm:block">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Margen</p>
          <p className="text-sm font-medium font-mono text-status-ok-fg dark:text-status-ok-fg">
            {quote.marginPct != null
              ? `${formatNumber(quote.marginPct, { minDecimals: 1, maxDecimals: 1 })}%`
              : "—"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 hidden sm:block" />
      </div>
    </Link>
  );
}

/* ── Card item ── */
function QuoteCardItem({ quote, ufValue, hasUnreadNotes }: { quote: QuoteRow; ufValue: number; hasUnreadNotes?: boolean }) {
  const status = STATUS_MAP[quote.status] || STATUS_MAP.draft;
  const salePriceClp = Number(quote.salePriceMonthly);
  const salePriceUf = ufValue > 0 ? formatUFSuffix(clpToUf(salePriceClp, ufValue)) : null;
  return (
    <Link
      href={`/crm/cotizaciones/${quote.id}`}
      className="block rounded-lg border p-4 transition-colors hover:bg-accent/30 group min-w-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-medium truncate">{quote.code}</span>
          {hasUnreadNotes && (
            <span className="relative shrink-0" title="Notas no leídas">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
            </span>
          )}
        </span>
        <Badge variant="outline" className={`shrink-0 ${status.className}`}>
          {status.label}
        </Badge>
      </div>
      {/* Stage, follow-up & lead-origin badges */}
      {(quote.dealStageName || (quote.pendingFollowUps ?? 0) > 0 || quote.createdFromLeadId) && (
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          {quote.createdFromLeadId && (
            <Link
              href={`/crm/leads/${quote.createdFromLeadId}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-status-info-border text-status-info-fg hover:bg-status-info-soft transition-colors cursor-pointer">
                <Zap className="h-3 w-3" />
                Desde Lead
              </Badge>
            </Link>
          )}
          {quote.dealStageName && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
              {quote.dealStageColor && (
                <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: quote.dealStageColor }} />
              )}
              {quote.dealStageName}
            </Badge>
          )}
          {(quote.pendingFollowUps ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-violet-500/30 text-violet-600 dark:text-violet-400">
              <CalendarClock className="h-3 w-3" />
              Seguimiento
            </Badge>
          )}
        </div>
      )}
      {quote.name && (
        <p className="text-sm font-medium truncate">{quote.name}</p>
      )}
      {quote.dealTitle && (
        <p className="text-sm truncate">
          {quote.dealId ? (
            <Link
              href={`/crm/deals/${quote.dealId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-status-info-fg hover:underline inline-flex items-center gap-1 transition-colors"
            >
              {quote.dealTitle}
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ) : (
            <span className="text-foreground">{quote.dealTitle}</span>
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
        {quote.accountId ? (
          <Link
            href={`/crm/accounts/${quote.accountId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-status-info-fg hover:text-status-ok-fg hover:underline transition-colors"
          >
            {quote.accountName || quote.clientName || "Sin cliente"}
          </Link>
        ) : (
          <span>{quote.accountName || quote.clientName || "Sin cliente"}</span>
        )}
        {quote.contactName && (
          <>
            <span>·</span>
            <Link
              href={`/crm/contacts/${quote.contactId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-status-info-fg hover:text-status-info-fg hover:underline transition-colors block truncate w-full"
              title={quote.contactName}
            >
              {quote.contactName}
            </Link>
          </>
        )}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Guardias</p>
          <p className="text-sm font-medium font-mono">{quote.totalGuards}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">P. venta</p>
          <p className="text-sm font-medium font-mono">{formatCLP(salePriceClp)}</p>
          {salePriceUf ? (
            <p className="text-[10px] font-semibold text-muted-foreground">{salePriceUf}</p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Margen</p>
          <p className="text-sm font-medium font-mono text-status-ok-fg dark:text-status-ok-fg">
            {quote.marginPct != null
              ? `${formatNumber(quote.marginPct, { minDecimals: 1, maxDecimals: 1 })}%`
              : "—"}
          </p>
        </div>
      </div>
      <CrmDates createdAt={quote.createdAt} updatedAt={quote.updatedAt} className="mt-2" />
    </Link>
  );
}

