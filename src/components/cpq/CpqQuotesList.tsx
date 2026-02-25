/**
 * Lista de cotizaciones CPQ — Redesigned
 */

"use client";

import Link from "next/link";
import { formatCurrency } from "@/components/cpq/utils";
import { cn } from "@/lib/utils";
import type { CpqQuote } from "@/types/cpq";
import { ChevronRight } from "lucide-react";

interface CpqQuotesListProps {
  quotes: CpqQuote[];
  loading?: boolean;
}

const statusDotColor: Record<string, string> = {
  draft: "bg-amber-400",
  sent: "bg-emerald-400",
  approved: "bg-emerald-500",
  rejected: "bg-rose-400",
};

export function CpqQuotesList({ quotes, loading }: CpqQuotesListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border/40 p-3 min-h-[56px]">
            <div className="h-2.5 w-2.5 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-1/3 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-2/3 rounded bg-muted/60 animate-pulse" />
            </div>
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!quotes.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      {quotes.map((quote) => (
        <Link key={quote.id} href={`/cpq/${quote.id}`}>
          <div className="flex items-center gap-3 rounded-lg border border-border/40 p-3 hover:bg-accent/30 transition-colors min-h-[56px]">
            <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", statusDotColor[quote.status] || "bg-muted-foreground")} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{quote.code}</p>
              <p className="text-xs text-muted-foreground truncate">
                {quote.clientName || "Sin cliente"} · {quote.totalPositions} puestos
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-sm font-semibold">{formatCurrency(Number(quote.monthlyCost))}</p>
              <p className="text-[10px] text-muted-foreground uppercase">mensual</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          </div>
        </Link>
      ))}
    </div>
  );
}
