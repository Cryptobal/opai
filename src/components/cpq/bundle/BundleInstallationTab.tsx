"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, LayoutTemplate } from "lucide-react";
import { Surface, Skeleton, EmptyState } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PositionMatrix } from "@/components/cpq/position-matrix";
import { usePositionMatrixCpq } from "@/components/cpq/position-matrix/usePositionMatrixCpq";
import { useBundleQuote } from "./useBundleQuote";

export function BundleInstallationTab({
  quoteId,
  onBundleRefresh,
}: {
  quoteId: string;
  onBundleRefresh: () => Promise<void>;
}) {
  const {
    quote,
    positions,
    serviceGroups,
    costsSummary,
    loading,
    error,
    ufValue,
    refresh,
    updateMargin,
  } = useBundleQuote(quoteId);
  const [marginDraft, setMarginDraft] = useState<string | null>(null);

  const refreshAll = async () => {
    await refresh();
    await onBundleRefresh();
  };

  const matrixAdapter = usePositionMatrixCpq({
    quoteId,
    positions,
    serviceGroups,
    refresh: () => {
      void refreshAll();
    },
    currency: quote?.currency || "UF",
    ufValue,
  });

  if (loading && !quote) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="No se pudo cargar la instalación"
        description={error || "Intenta de nuevo"}
      />
    );
  }

  const margin =
    marginDraft ??
    String(quote.parameters?.marginPct != null ? Number(quote.parameters.marginPct) : 13);

  return (
    <div className="space-y-4 ds-page-enter">
      <Surface elevation={1} padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-mono text-ds-text-3">{quote.code}</p>
          <h2 className="font-display text-base truncate">
            {quote.installation?.name || quote.name || "Instalación"}
          </h2>
          <p className="text-[13px] text-ds-text-3">
            {quote.totalGuards} guardias · {quote.totalPositions} puestos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-ds-text-3">Margen %</span>
            <Input
              className="h-10 sm:h-9 w-20 font-mono"
              value={margin}
              onChange={(e) => setMarginDraft(e.target.value)}
              onBlur={() => {
                const n = Number(margin);
                if (!Number.isFinite(n)) return;
                void updateMargin(n).then(() => {
                  setMarginDraft(null);
                  void onBundleRefresh();
                });
              }}
            />
          </label>
          <Button asChild variant="outline" size="sm" className="h-10 sm:h-9">
            <Link href={`/crm/cotizaciones/${quoteId}`} target="_blank">
              Ver cotización completa
              <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </Surface>

      {positions.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-8 w-8" />}
          title="Sin puestos"
          description="Agrega puestos con plantillas o desde la cotización completa."
        />
      ) : null}

      <PositionMatrix adapter={matrixAdapter} />

      {costsSummary ? (
        <Surface elevation={1} padding="md" className="space-y-1">
          <h3 className="text-[12px] uppercase tracking-wide text-ds-text-3">
            Resumen de costos (lectura)
          </h3>
          <p className="font-mono text-[13px] text-primary">
            Mensual: {String(
              (costsSummary as { monthlyTotal?: number }).monthlyTotal ??
                quote.monthlyCost,
            )}
          </p>
        </Surface>
      ) : null}
    </div>
  );
}
