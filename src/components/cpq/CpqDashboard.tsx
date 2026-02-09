/**
 * CPQ Dashboard
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, KpiCard } from "@/components/opai";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { CpqQuotesList } from "@/components/cpq/CpqQuotesList";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuote } from "@/types/cpq";
import { FileText, Plus, Settings } from "lucide-react";

interface CpqDashboardProps {
  initialQuotes?: CpqQuote[];
}

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PageHeader title="CPQ" description="Cotizador de servicios de seguridad" />
        <div className="flex items-center gap-2">
          <CreateQuoteModal onCreated={refresh} variant="quick" />
          <Link href="/cpq/config">
            <Button variant="outline" size="sm" className="gap-2 bg-slate-800/50 border-slate-600 text-slate-200 hover:bg-slate-700/50 hover:text-white">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurar</span>
            </Button>
          </Link>
          <Link href="/payroll/simulator">
            <Button variant="outline" size="sm" className="gap-2 bg-slate-800/50 border-slate-600 text-slate-200 hover:bg-slate-700/50 hover:text-white">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Payroll</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
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
        <Card className="border-muted/40 bg-card p-4 col-span-2 md:col-span-1">
          <p className="text-xs sm:text-sm uppercase text-muted-foreground">Estado</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline">Borradores</Badge>
            <Badge variant="secondary">Enviadas</Badge>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Cotizaciones recientes</h2>
          <Button size="sm" variant="outline" className="gap-2" onClick={refresh}>
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o cliente"
            className="h-10 sm:h-9 bg-slate-900/80 text-white border-blue-600/40 placeholder:text-slate-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("all")}
              className={statusFilter === "all" ? "bg-blue-600/20 border-blue-500/50 text-blue-300" : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800/60"}
            >
              Todas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("draft")}
              className={statusFilter === "draft" ? "bg-blue-600/20 border-blue-500/50 text-blue-300" : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800/60"}
            >
              Borradores
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("sent")}
              className={statusFilter === "sent" ? "bg-blue-600/20 border-blue-500/50 text-blue-300" : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800/60"}
            >
              Enviadas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("approved")}
              className={statusFilter === "approved" ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300" : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800/60"}
            >
              Aprobadas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("rejected")}
              className={statusFilter === "rejected" ? "bg-rose-600/20 border-rose-500/50 text-rose-300" : "bg-slate-900/60 border-slate-700 text-slate-300 hover:bg-slate-800/60"}
            >
              Rechazadas
            </Button>
          </div>
        </div>
        <CpqQuotesList quotes={filteredQuotes} loading={loading} />
        {!loading && !filteredQuotes.length && (
          <div className="text-sm text-muted-foreground">
            No hay cotizaciones para los filtros seleccionados.
          </div>
        )}
      </Card>
    </div>
  );
}
