"use client";

/**
 * Tabla de instalaciones de la propuesta: incluir/excluir del envío, abrir su
 * tab, duplicar (clonando dotación/costos/líneas/includes) y quitar (desvincula
 * la cotización del bundle; NO la elimina — queda en el negocio).
 */

import { toast } from "sonner";
import { Building2, Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Surface, EmptyState } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-service";
import type { BundleDetail, BundleMember } from "@/components/cpq/bundle/useBundle";
import { fmtBundleMoney, memberMonthlyClp } from "./bundle-billing";

export function InstalacionesSection({
  bundle,
  ufValue,
  onRefresh,
  onOpenInstall,
  onAdd,
  onDuplicate,
}: {
  bundle: BundleDetail;
  ufValue: number | null;
  onRefresh: () => Promise<void>;
  onOpenInstall: (quoteId: string) => void;
  onAdd: () => void;
  /** Abre el modal Agregar con la dotación de esta cotización preseleccionada. */
  onDuplicate: (quoteId: string) => void;
}) {
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

  const removeMember = async (m: BundleMember) => {
    const confirmed = await confirmDialog({
      description: `Quitar "${m.quote.installation?.name || m.quote.code}" de la propuesta. La cotización NO se elimina: queda disponible en el negocio. ¿Continuar?`,
      confirmLabel: "Quitar",
      variant: "destructive",
    });
    if (!confirmed) return;
    const res = await fetch(
      `/api/cpq/bundles/${bundle.id}/quotes?quoteId=${m.quoteId}`,
      { method: "DELETE" },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      toast.error(json.error || "No se pudo quitar la instalación");
      return;
    }
    toast.success("Instalación quitada de la propuesta");
    await onRefresh();
  };

  if (bundle.quotes.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-8 w-8" />}
        title="Sin instalaciones"
        description="Agrega la primera instalación para armar la propuesta consolidada."
        action={<Button className="h-10" onClick={onAdd}>Agregar instalación</Button>}
      />
    );
  }

  const rowActions = (m: BundleMember) => (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        title="Abrir instalación"
        onClick={() => onOpenInstall(m.quoteId)}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        title="Duplicar instalación"
        onClick={() => onDuplicate(m.quoteId)}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-status-danger-fg/70 hover:text-status-danger-fg"
        title="Quitar de la propuesta"
        onClick={() => void removeMember(m)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-instalaciones">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base text-foreground">Instalaciones</h2>
        <Button size="sm" className="h-10 sm:h-9 gap-1" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      {/* Mobile: tarjetas apiladas */}
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
                    {fmtBundleMoney(memberMonthlyClp(m), bundle.currency, ufValue)}
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
              <div className="flex justify-end">{rowActions(m)}</div>
            </Surface>
          </li>
        ))}
      </ul>

      {/* Desktop: tabla */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-ds-text-3 border-b border-ds-border-subtle">
              <th className="py-2 pr-2 font-medium">Incluir</th>
              <th className="py-2 pr-2 font-medium">Instalación</th>
              <th className="py-2 pr-2 font-medium">Puestos</th>
              <th className="py-2 pr-2 font-medium">Dotación</th>
              <th className="py-2 pr-2 font-medium">Mensual</th>
              <th className="py-2 pr-2 font-medium">Margen</th>
              <th className="py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {bundle.quotes.map((m) => (
              <tr
                key={m.id}
                className="border-b border-ds-border-subtle/60 hover:bg-ds-surface-2/50"
              >
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={m.includedInProposal}
                    onChange={(e) => void toggleInclude(m, e.target.checked)}
                  />
                </td>
                <td className="py-2 pr-2">
                  <button
                    type="button"
                    className="text-left text-primary hover:underline"
                    onClick={() => onOpenInstall(m.quoteId)}
                  >
                    {m.quote.installation?.name || m.quote.code}
                  </button>
                  <span className="ml-1.5 font-mono text-[12px] text-ds-text-3">
                    {m.quote.code}
                  </span>
                </td>
                <td className="py-2 pr-2 font-mono">{m.quote.totalPositions}</td>
                <td className="py-2 pr-2 font-mono">{m.quote.totalGuards}</td>
                <td className="py-2 pr-2 font-mono text-primary">
                  {fmtBundleMoney(memberMonthlyClp(m), bundle.currency, ufValue)}
                </td>
                <td className="py-2 pr-2 font-mono">
                  {m.quote.parameters?.marginPct != null
                    ? `${Number(m.quote.parameters.marginPct)}%`
                    : "—"}
                </td>
                <td className="py-2 text-right">{rowActions(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
