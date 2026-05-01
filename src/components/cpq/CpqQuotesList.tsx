/**
 * Lista de cotizaciones CPQ
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuote } from "@/types/cpq";
import { isCpqQuoteListedInClientPortal } from "@/lib/cpq-portal-visibility";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CpqQuotesListProps {
  quotes: CpqQuote[];
  loading?: boolean;
  /** Tras cambiar visibilidad en portal (PATCH) */
  onRefresh?: () => void;
}

export function CpqQuotesList({ quotes, loading, onRefresh }: CpqQuotesListProps) {
  const [savingPortalId, setSavingPortalId] = useState<string | null>(null);
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="h-5 w-16 rounded bg-muted animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-3/4 rounded bg-muted/60 animate-pulse" />
            </div>
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!quotes.length) {
    return <div className="text-sm text-muted-foreground">No hay cotizaciones aún.</div>;
  }

  const statusLabel = (status: string) => {
    if (status === "sent") return "Enviada";
    if (status === "draft") return "Borrador";
    if (status === "approved") return "Aprobada";
    if (status === "rejected") return "Rechazada";
    return status;
  };

  const statusStyle = (status: string) => {
    if (status === "sent") {
      return "bg-status-ok-soft text-status-ok-fg border-status-ok-border";
    }
    if (status === "draft") {
      return "bg-muted text-muted-foreground border-border";
    }
    if (status === "approved") {
      return "bg-status-ok-soft text-status-ok-fg border-status-ok-border";
    }
    if (status === "rejected") {
      return "bg-status-danger-soft text-status-danger-fg border-status-danger-border";
    }
    return "bg-muted/20 text-muted-foreground border-border/40";
  };

  const handlePortalSwitch = async (quote: CpqQuote, checked: boolean) => {
    setSavingPortalId(quote.id);
    try {
      const res = await fetch(`/api/cpq/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibleInClientPortal: checked }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Error");
      toast.success(
        checked ? "Visible en el portal del cliente" : "Oculta del portal del cliente"
      );
      onRefresh?.();
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar la visibilidad en el portal");
    } finally {
      setSavingPortalId(null);
    }
  };

  return (
    <div className="space-y-2">
      {quotes.map((quote) => {
        const listed = isCpqQuoteListedInClientPortal({
          visibleInClientPortal: quote.visibleInClientPortal ?? null,
          status: quote.status,
        });
        const canPortal = Boolean(quote.accountId);
        return (
          <Card key={quote.id} className="flex items-stretch gap-0 overflow-hidden p-0">
            <Link
              href={`/cpq/${quote.id}`}
              className="flex flex-1 min-w-0 items-center justify-between gap-3 p-3 hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold truncate">
                    {quote.code}
                    {quote.name ? ` — ${quote.name}` : ""}
                  </p>
                  <Badge className={`text-xs border shrink-0 ${statusStyle(quote.status)}`}>
                    <span className="inline-flex h-2 w-2 rounded-full bg-current opacity-70" />
                    <span className="ml-2">{statusLabel(quote.status)}</span>
                  </Badge>
                  {listed ? (
                    <Badge variant="outline" className="text-xs shrink-0 border-teal-500/40 text-teal-600 dark:text-status-info-fg">
                      Portal
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  {quote.clientName || "Cliente sin nombre"} · {quote.totalPositions} puestos ·{" "}
                  {quote.totalGuards} guardias
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs sm:text-sm uppercase text-muted-foreground">Costo mensual</p>
                <p className="font-mono text-base sm:text-sm">{formatCurrency(Number(quote.monthlyCost))}</p>
              </div>
            </Link>
            <div className="flex flex-col justify-center gap-1 px-3 py-2 border-l border-border/60 bg-muted/5 min-w-[7.5rem]">
              <Label
                htmlFor={`portal-${quote.id}`}
                className="text-xs text-muted-foreground font-normal leading-tight cursor-pointer"
              >
                Portal cliente
              </Label>
              <div className="flex items-center gap-1.5">
                {savingPortalId === quote.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
                <Switch
                  id={`portal-${quote.id}`}
                  checked={listed}
                  disabled={!canPortal || savingPortalId === quote.id}
                  title={
                    !canPortal
                      ? "Asigna una cuenta CRM en el detalle para usar el portal"
                      : listed
                        ? "Visible en el portal del prospecto o cliente"
                        : "Mostrar en el portal del cliente"
                  }
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(v) => void handlePortalSwitch(quote, v)}
                />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
