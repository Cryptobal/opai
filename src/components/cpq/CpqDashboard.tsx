/**
 * CPQ Dashboard — Redesigned
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, KpiCard, EmptyState } from "@/components/opai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { CpqQuotesList } from "@/components/cpq/CpqQuotesList";
import { formatCurrency } from "@/components/cpq/utils";
import { cn } from "@/lib/utils";
import type { CpqQuote } from "@/types/cpq";
import { FileText, MoreHorizontal, RefreshCw, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CpqDashboardProps {
  initialQuotes?: CpqQuote[];
}

const STATUS_FILTERS = [
  { key: "all", label: "Todas" },
  { key: "draft", label: "Borradores" },
  { key: "sent", label: "Enviadas" },
  { key: "approved", label: "Aprobadas" },
  { key: "rejected", label: "Rechazadas" },
] as const;

export function CpqDashboard({ initialQuotes }: CpqDashboardProps) {
  const [quotes, setQuotes] = useState<CpqQuote[]>(initialQuotes || []);
  const [loading, setLoading] = useState(!initialQuotes);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "draft" | "sent" | "approved" | "rejected"
  >("all");

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cpq/quotes", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setQuotes(data.data || []);
    } catch (err) {
      console.error("Error loading CPQ quotes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const totals = useMemo(() => {
    const totalQuotes = quotes.length;
    const totalMonthly = quotes.reduce((sum, q) => sum + Number(q.monthlyCost), 0);
    return { totalQuotes, totalMonthly };
  }, [quotes]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: quotes.length };
    for (const q of quotes) {
      counts[q.status] = (counts[q.status] || 0) + 1;
    }
    return counts;
  }, [quotes]);

  const filteredQuotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      const statusMatch =
        statusFilter === "all" ? true : quote.status === statusFilter;
      const searchMatch = query
        ? `${quote.code} ${quote.clientName ?? ""}`.toLowerCase().includes(query)
        : true;
      return statusMatch && searchMatch;
    });
  }, [quotes, search, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="CPQ" description="Cotizador de servicios de seguridad" />
        <div className="flex items-center gap-2">
          <CreateQuoteModal onCreated={refresh} variant="quick" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-10 w-10">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link href="/cpq/config">
                  <Settings className="h-4 w-4 mr-2" />
                  Configurar
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/payroll/simulator">
                  <FileText className="h-4 w-4 mr-2" />
                  Payroll
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={refresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2">
        <KpiCard
          title="Cotizaciones"
          value={totals.totalQuotes}
          variant="blue"
          size="lg"
        />
        <KpiCard
          title="Costo mensual"
          value={formatCurrency(totals.totalMonthly)}
          variant="emerald"
          size="lg"
        />
      </div>

      {/* Search + Segmented Filter */}
      <div className="space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código o cliente..."
          className="h-11 bg-card/80 text-foreground border-input placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/30 p-0.5 overflow-x-auto scrollbar-hide">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                statusFilter === f.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
              {(statusCounts[f.key] ?? 0) > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted-foreground/20 px-1 text-[10px]">
                  {statusCounts[f.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes List */}
      <CpqQuotesList quotes={filteredQuotes} loading={loading} />
      {!loading && !filteredQuotes.length && (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="Sin cotizaciones"
          description="No hay cotizaciones para los filtros seleccionados."
          compact
        />
      )}
    </div>
  );
}
