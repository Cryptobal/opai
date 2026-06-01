"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  folio?: number | null;
  dteId?: string | null;
  /** Celda en borrador sin folio asignado todavía. */
  isDraft?: boolean;
  className?: string;
}

/**
 * Chip de folio de factura. Con folio → deep-link al DTE (text-primary, mono).
 * En borrador sin folio → chip ámbar. Sin DTE → no renderiza nada.
 */
export function FolioChip({ folio, dteId, isDraft, className }: Props) {
  // folio > 0 = factura real con folio asignado. folio 0 (o null) = borrador
  // sin folio: no mostramos "N° 0" (la pill de estado ya indica BOR/borrador).
  if (folio != null && folio > 0) {
    const chip = (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-ds-sm border border-primary/30 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-primary",
          dteId && "cursor-pointer hover:bg-primary/10",
          className,
        )}
      >
        <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
        N° {folio}
      </span>
    );
    if (dteId) {
      return (
        <Link
          href={`/finanzas/facturacion/dtes?dte=${dteId}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Ver factura N° ${folio}`}
        >
          {chip}
        </Link>
      );
    }
    return chip;
  }
  if (isDraft) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-ds-sm border border-status-warn-border bg-status-warn-soft px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-status-warn-fg",
          className,
        )}
      >
        <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
        borrador
      </span>
    );
  }
  return null;
}
