/**
 * CPQ Dashboard
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHero } from "@/components/opai-ds";
import { Stat } from "@/components/opai-ds";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { CpqQuotesList } from "@/components/cpq/CpqQuotesList";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuote } from "@/types/cpq";
import { FileText, Info, Plus, Settings, Globe, LayoutDashboard } from "lucide-react";
import { isCpqQuoteListedInClientPortal } from "@/lib/cpq-portal-visibility";

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
  const [portalOnly, setPortalOnly] = useState(false);

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
    const visibleInPortal = quotes.filter((q) =>
      isCpqQuoteListedInClientPortal({
        visibleInClientPortal: q.visibleInClientPortal ?? null,
        status: q.status,
      })
    ).length;
    return { totalQuotes, totalMonthly, visibleInPortal };
  }, [quotes]);

  const filteredQuotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      const statusMatch =
        statusFilter === "all" ? true : quote.status === statusFilter;
      const searchMatch = query
        ? `${quote.code} ${quote.clientName ?? ""}`.toLowerCase().includes(query)
        : true;
      const portalMatch = portalOnly
        ? isCpqQuoteListedInClientPortal({
            visibleInClientPortal: quote.visibleInClientPortal ?? null,
            status: quote.status,
          })
        : true;
      return statusMatch && searchMatch && portalMatch;
    });
  }, [quotes, search, statusFilter, portalOnly]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PageHero
          icon={<LayoutDashboard />}
          iconTone="violet"
          eyebrow={["Comercial", "CPQ"]}
          title="CPQ"
          subtitle="Configure, Price, Quote"
          description="Cotizador de servicios de seguridad"
        />
        <div className="flex items-center gap-2">
          <CreateQuoteModal onCreated={refresh} variant="quick" />
          <Link href="/cpq/config">
            <Button variant="outline" size="sm" className="gap-2 ">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configurar</span>
            </Button>
          </Link>
          <Link href="/payroll/simulator">
            <Button variant="outline" size="sm" className="gap-2 ">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Payroll</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="Cotizaciones" value={totals.totalQuotes} variant="brand" />
        <Stat
          label="Costo mensual"
          value={formatCurrency(totals.totalMonthly)}
          variant="ok"
        />
        <div className="relative">
          <Stat
            label="Visibles en portal"
            value={totals.visibleInPortal}
            variant="brand"
            icon={Globe}
            hint="Prospecto / cliente"
          />
          <span
            className="group/info absolute top-3 right-9 sm:top-3.5 sm:right-10 inline-flex"
            tabIndex={0}
            role="button"
            aria-label="Más información sobre cotizaciones visibles"
          >
            <Info className="h-3.5 w-3.5 text-ds-text-4 hover:text-ds-text-2 cursor-help" aria-hidden />
            <span className="pointer-events-none absolute right-0 top-full mt-1.5 hidden w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg group-hover/info:block group-focus-within/info:block z-50">
              Cotizaciones que el cliente puede ver en su portal (según estado y el interruptor
              &quot;Visible en portal del cliente&quot;).
            </span>
          </span>
        </div>
        <Card className="border-muted/40 bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Leyenda estado</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Borrador</Badge>
            <Badge variant="secondary">Enviada</Badge>
            <Badge className="border-status-info-border text-status-info-fg" variant="outline">
              Portal
            </Badge>
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
            className="h-9 bg-card/80 text-foreground border-input placeholder:text-muted-foreground"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("all")}
              className={statusFilter === "all" ? "bg-primary/15 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:bg-accent"}
            >
              Todas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("draft")}
              className={statusFilter === "draft" ? "bg-primary/15 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:bg-accent"}
            >
              Borradores
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("sent")}
              className={statusFilter === "sent" ? "bg-primary/15 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:bg-accent"}
            >
              Enviadas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("approved")}
              className={statusFilter === "approved" ? "bg-status-ok-soft border-status-ok-border text-status-ok-fg" : "bg-background border-border text-muted-foreground hover:bg-accent"}
            >
              Aprobadas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("rejected")}
              className={statusFilter === "rejected" ? "bg-status-danger-soft border-status-danger-border text-status-danger-fg" : "bg-background border-border text-muted-foreground hover:bg-accent"}
            >
              Rechazadas
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPortalOnly((v) => !v)}
              className={
                portalOnly
                  ? "bg-status-info-soft border-status-info-border text-status-info-fg"
                  : "bg-background border-border text-muted-foreground hover:bg-accent"
              }
              title="Filtrar cotizaciones visibles en el portal del cliente"
            >
              <Globe className="h-3.5 w-3.5 mr-1 inline" />
              En portal
            </Button>
          </div>
        </div>
        <CpqQuotesList quotes={filteredQuotes} loading={loading} onRefresh={refresh} />
        {!loading && !filteredQuotes.length && (
          <div className="text-sm text-muted-foreground">
            No hay cotizaciones para los filtros seleccionados.
          </div>
        )}
      </Card>
    </div>
  );
}
