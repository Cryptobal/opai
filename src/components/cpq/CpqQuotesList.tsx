/**
 * Lista de cotizaciones CPQ
 */

"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/components/cpq/utils";
import type { CpqQuote } from "@/types/cpq";

interface CpqQuotesListProps {
  quotes: CpqQuote[];
  loading?: boolean;
}

export function CpqQuotesList({ quotes, loading }: CpqQuotesListProps) {
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
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    }
    if (status === "draft") {
      return "bg-muted text-muted-foreground border-border";
    }
    if (status === "approved") {
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    }
    if (status === "rejected") {
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    }
    return "bg-muted/20 text-muted-foreground border-border/40";
  };

  return (
    <div className="space-y-2">
      {quotes.map((quote) => (
        <Link key={quote.id} href={`/cpq/${quote.id}`}>
          <Card className="flex items-center justify-between gap-3 p-3 hover:bg-muted/20">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{quote.code}{quote.name ? ` — ${quote.name}` : ""}</p>
                <Badge className={`text-xs border ${statusStyle(quote.status)}`}>
                  <span className="inline-flex h-2 w-2 rounded-full bg-current opacity-70" />
                  <span className="ml-2">{statusLabel(quote.status)}</span>
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {quote.clientName || "Cliente sin nombre"} · {quote.totalPositions} puestos · {quote.totalGuards} guardias
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs sm:text-sm uppercase text-muted-foreground">Costo mensual</p>
              <p className="font-mono text-base sm:text-sm">{formatCurrency(Number(quote.monthlyCost))}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
