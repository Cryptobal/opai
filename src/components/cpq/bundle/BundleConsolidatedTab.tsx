"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Surface, Tag, EmptyState } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import type { BundleDetail, BundleMember } from "./useBundle";

function fmtMoney(n: number, currency: string) {
  if (currency === "UF") {
    return `${Number(n).toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF`;
  }
  return `$${Math.round(Number(n)).toLocaleString("es-CL")}`;
}

export function BundleConsolidatedTab({
  bundle,
  onRefresh,
  onOpenInstall,
}: {
  bundle: BundleDetail;
  onRefresh: () => Promise<void>;
  onOpenInstall: (quoteId: string) => void;
}) {
  const [syncing, setSyncing] = useState(false);

  const toggleInclude = async (m: BundleMember, next: boolean) => {
    const res = await fetch(`/api/cpq/bundles/${bundle.id}/quotes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [{ quoteId: m.quoteId, includedInProposal: next }],
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(json.error || "No se pudo actualizar");
      return;
    }
    await onRefresh();
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/cpq/bundles/${bundle.id}/sync-conditions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Error al sincronizar");
        return;
      }
      toast.success(`Condiciones aplicadas a ${json.data.updatedCount} cotizaciones`);
      await onRefresh();
    } finally {
      setSyncing(false);
    }
  };

  const ref = bundle.quotes[0]?.quote;

  if (bundle.quotes.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-8 w-8" />}
        title="Sin instalaciones"
        description="Agrega la primera instalación para armar la propuesta consolidada."
      />
    );
  }

  return (
    <div className="space-y-4 ds-page-enter">
      <Surface elevation={1} padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base text-foreground">
            Instalaciones incluidas
          </h2>
          <Tag variant={bundle.conditionsSynced ? "ok" : "warn"} size="sm">
            {bundle.conditionsSynced ? "Sync" : "Difiere"}
          </Tag>
        </div>

        <ul className="ds-list-cascade space-y-2 sm:hidden">
          {bundle.quotes.map((m) => (
            <li key={m.id}>
                <Surface elevation={1} padding="sm" className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="text-left min-w-0"
                    onClick={() => onOpenInstall(m.quoteId)}
                  >
                    <p className="font-medium text-[13px] truncate">
                      {m.quote.installation?.name || m.quote.code}
                    </p>
                    <p className="text-[12px] text-ds-text-3 font-mono">
                      {m.quote.code} · {m.quote.totalGuards}g ·{" "}
                      {fmtMoney(Number(m.quote.monthlyCost), bundle.currency)}
                    </p>
                  </button>
                  <label className="flex h-11 items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={m.includedInProposal}
                      onChange={(e) => void toggleInclude(m, e.target.checked)}
                    />
                    Incluir
                  </label>
                </div>
              </Surface>
            </li>
          ))}
        </ul>

        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-ds-text-3 border-b border-ds-border-subtle">
                <th className="py-2 pr-2 font-medium">Incluir</th>
                <th className="py-2 pr-2 font-medium">Instalación</th>
                <th className="py-2 pr-2 font-medium">Puestos</th>
                <th className="py-2 pr-2 font-medium">Dotación</th>
                <th className="py-2 pr-2 font-medium">Mensual</th>
                <th className="py-2 font-medium">Margen</th>
              </tr>
            </thead>
            <tbody>
              {bundle.quotes.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-ds-border-subtle/60 hover:bg-ds-surface-2/50"
                >
                  <td className="py-2.5 pr-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={m.includedInProposal}
                      onChange={(e) => void toggleInclude(m, e.target.checked)}
                    />
                  </td>
                  <td className="py-2.5 pr-2">
                    <button
                      type="button"
                      className="text-left text-primary hover:underline"
                      onClick={() => onOpenInstall(m.quoteId)}
                    >
                      {m.quote.installation?.name || m.quote.code}
                    </button>
                  </td>
                  <td className="py-2.5 pr-2 font-mono">{m.quote.totalPositions}</td>
                  <td className="py-2.5 pr-2 font-mono">{m.quote.totalGuards}</td>
                  <td className="py-2.5 pr-2 font-mono text-primary">
                    {fmtMoney(Number(m.quote.monthlyCost), bundle.currency)}
                  </td>
                  <td className="py-2.5 font-mono">
                    {m.quote.parameters?.marginPct != null
                      ? `${Number(m.quote.parameters.marginPct)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      <Surface elevation={1} padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base text-foreground">
            Condiciones comerciales compartidas
          </h2>
          <Button
            size="sm"
            className="h-10 sm:h-9"
            onClick={() => void syncAll()}
            disabled={syncing || !ref}
          >
            {syncing ? "Aplicando…" : "Aplicar a todas"}
          </Button>
        </div>
        {ref ? (
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
            {[
              ["Moneda", ref.currency],
              ["Pago", ref.paymentTerms],
              ["Duración", `${ref.contractDuration} meses`],
              ["Inicio", `${ref.serviceStartDays} días`],
              ["Reajuste", ref.adjustmentType],
              ["Días pago", String(ref.paymentDays)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] uppercase tracking-wide text-ds-text-3">
                  {k}
                </dt>
                <dd className="mt-0.5 text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="text-[12px] text-ds-text-3">
          Las condiciones se editan en cada cotización; usa &quot;Aplicar a todas&quot;
          para sincronizar desde la primera.
        </p>
      </Surface>
    </div>
  );
}
