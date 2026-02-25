"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/opai/EmptyState";
import { FileText, ChevronRight, Plus, Loader2 } from "lucide-react";
import { formatCLP, formatNumber } from "@/lib/utils";
import { CrmDates } from "@/components/crm/CrmDates";
import { CrmToolbar } from "./CrmToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";
import { toast } from "sonner";

type QuoteRow = {
  id: string;
  code: string;
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
  dealTitle?: string | null;
  accountName?: string | null;
};

type AccountRow = {
  id: string;
  name: string;
};

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "Borrador", className: "" },
  sent: { label: "Enviada", className: "border-blue-500/30 text-blue-400" },
  approved: { label: "Aprobada", className: "border-emerald-500/30 text-emerald-400" },
  rejected: { label: "Rechazada", className: "border-red-500/30 text-red-400" },
};

export function CrmCotizacionesClient({
  quotes,
  accounts,
}: {
  quotes: QuoteRow[];
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [sort, setSort] = useState("newest");
  const [creating, setCreating] = useState(false);

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
      if (q && !`${quote.code} ${quote.clientName || ""} ${quote.dealTitle || ""} ${quote.accountName || ""}`.toLowerCase().includes(q)) return false;
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
    { key: "draft", label: "Borrador", count: counts.draft },
    { key: "sent", label: "Enviadas", count: counts.sent },
    { key: "approved", label: "Aprobadas", count: counts.approved },
    { key: "rejected", label: "Rechazadas", count: counts.rejected },
  ];

  return (
    <div className="space-y-4">
      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total" value={counts.total} />
        <SummaryCard label="Borradores" value={counts.draft} />
        <SummaryCard label="Enviadas" value={counts.sent} className="text-blue-400" />
        <SummaryCard label="Aprobadas" value={counts.approved} className="text-emerald-400" />
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
              icon={<FileText className="h-8 w-8" />}
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
                <QuoteListRow key={quote.id} quote={quote} />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {filteredQuotes.map((quote) => (
                <QuoteCardItem key={quote.id} quote={quote} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── List row ── */
function QuoteListRow({ quote }: { quote: QuoteRow }) {
  const status = STATUS_MAP[quote.status] || STATUS_MAP.draft;
  return (
    <Link
      href={`/crm/cotizaciones/${quote.id}`}
      className="flex items-center justify-between rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group min-w-0 overflow-hidden"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{quote.code}</span>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>
        {quote.dealTitle && (
          <p className="mt-0.5 text-sm text-foreground truncate">{quote.dealTitle}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {quote.accountName || quote.clientName || "Sin cliente"} · {quote.totalGuards} guardias · {quote.totalPositions} puestos
        </p>
        <CrmDates createdAt={quote.createdAt} updatedAt={quote.updatedAt} className="mt-0.5" />
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-3 text-right">
        <div className="text-xs hidden sm:block">
          <p className="text-muted-foreground">P. venta</p>
          <p className="text-sm font-medium">{formatCLP(Number(quote.salePriceMonthly))}</p>
        </div>
        <div className="text-xs hidden sm:block">
          <p className="text-muted-foreground">Costo</p>
          <p className="text-sm">{formatCLP(Number(quote.monthlyCost))}</p>
        </div>
        <div className="text-xs hidden sm:block">
          <p className="text-muted-foreground">Margen</p>
          <p className="text-sm font-medium text-emerald-400">
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
function QuoteCardItem({ quote }: { quote: QuoteRow }) {
  const status = STATUS_MAP[quote.status] || STATUS_MAP.draft;
  return (
    <Link
      href={`/crm/cotizaciones/${quote.id}`}
      className="block rounded-lg border p-4 transition-colors hover:bg-accent/30 group min-w-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-mono text-sm font-medium truncate">{quote.code}</span>
        <Badge variant="outline" className={`shrink-0 ${status.className}`}>
          {status.label}
        </Badge>
      </div>
      {quote.dealTitle && (
        <p className="text-sm font-medium truncate">{quote.dealTitle}</p>
      )}
      <p className="text-xs text-muted-foreground truncate">
        {quote.accountName || quote.clientName || "Sin cliente"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Guardias</p>
          <p className="text-sm font-medium">{quote.totalGuards}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">P. venta</p>
          <p className="text-sm font-medium">{formatCLP(Number(quote.salePriceMonthly))}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Margen</p>
          <p className="text-sm font-medium text-emerald-400">
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

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${className || ""}`}>{value}</p>
    </div>
  );
}
