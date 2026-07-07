"use client";

import { MapPin, ExternalLink, Copy, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { formatCurrency } from "@/components/cpq/utils";
import { LedgerRow } from "./LedgerRow";
import { LedgerInstallationAccordion } from "./LedgerInstallationAccordion";

/** Campos básicos editables de una instalación (subconjunto de InstallationDraft). */
export interface InstallationBasics {
  name: string;
  address: string;
  commune: string;
  city: string;
  lat?: number;
  lng?: number;
}

export interface LedgerInstallationRowProps {
  index: number;
  installation: InstallationBasics;
  inputClassName: string;
  positionCount: number;
  totalGuards: number;
  saleClp: number | null;
  saleUf: number | null;
  marginPct: number;
  currency: "CLP" | "UF";
  salePending: boolean;
  fromCotizadorWeb?: boolean;
  canRemove: boolean;
  onFieldChange: (field: "name" | "commune" | "city", value: string) => void;
  onAddressChange: (result: AddressResult) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  /** `<LeadInstallationCpq>` construido por el parent (todas sus secciones internas). */
  cpqSlot: React.ReactNode;
  defaultOpen?: boolean;
}

function saleSummary(
  salePending: boolean,
  saleClp: number | null,
  saleUf: number | null,
  currency: "CLP" | "UF",
): string {
  if (salePending) return "Calculando…";
  if (saleClp == null) return "Sin total";
  const uf = saleUf != null ? `${saleUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF` : null;
  if (currency === "UF" && uf) return `${uf} · ${formatCurrency(saleClp)}`;
  return uf ? `${formatCurrency(saleClp)} · ${uf}` : formatCurrency(saleClp);
}

export function LedgerInstallationRow({
  index,
  installation,
  inputClassName,
  positionCount,
  totalGuards,
  saleClp,
  saleUf,
  marginPct,
  currency,
  salePending,
  fromCotizadorWeb,
  canRemove,
  onFieldChange,
  onAddressChange,
  onRemove,
  onDuplicate,
  cpqSlot,
  defaultOpen,
}: LedgerInstallationRowProps) {
  const type = `Instalación #${index}${fromCotizadorWeb ? " · desde cotizador" : ""}`;
  const collapsedMeta =
    positionCount > 0
      ? `${positionCount} puesto(s) · ${totalGuards} guardias · ${saleSummary(salePending, saleClp, saleUf, currency)}`
      : "Sin puestos";
  const addressShort = installation.address?.split(",")[0]?.trim();
  const datosSummary = [addressShort, installation.commune, installation.city].filter(Boolean).join(" · ") || "Sin dirección";
  const mapsHref =
    installation.lat != null && installation.lng != null
      ? `https://www.google.com/maps/@${installation.lat},${installation.lng},17z`
      : installation.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(installation.address)}`
        : null;

  return (
    <LedgerRow
      id={`ledger-installation-${index}`}
      type={type}
      name={installation.name || "Sin nombre"}
      meta={collapsedMeta}
      created
      defaultOpen={defaultOpen}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-end gap-0.5">
          {canRemove && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Quitar instalación" onClick={onRemove}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Copiar esta instalación (datos y cotización)" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>

        <LedgerInstallationAccordion icon={MapPin} iconColorClass="text-tint-sky-fg" title="Datos básicos" summary={datosSummary} defaultOpen>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[12px]">Nombre *</Label>
              <Input value={installation.name} onChange={(e) => onFieldChange("name", e.target.value)} placeholder="Bodega central, Sucursal norte..." className={`h-9 text-sm ${inputClassName}`} />
            </div>
            <div className="relative z-[5] space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[12px]">Dirección (Google Maps)</Label>
                {mapsHref && (
                  <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-status-ok-fg" title="Abrir en Google Maps">
                    <ExternalLink className="h-3 w-3" />
                    Abrir en Maps
                  </a>
                )}
              </div>
              <AddressAutocomplete value={installation.address} onChange={onAddressChange} placeholder="Buscar dirección..." showMap={false} />
              <MapsUrlPasteInput onResolve={onAddressChange} className="mt-1.5" />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px]">Comuna</Label>
              <Input value={installation.commune} onChange={(e) => onFieldChange("commune", e.target.value)} placeholder="Las Condes" className={`h-9 text-sm ${inputClassName}`} />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px]">Ciudad</Label>
              <Input value={installation.city} onChange={(e) => onFieldChange("city", e.target.value)} placeholder="Santiago" className={`h-9 text-sm ${inputClassName}`} />
            </div>
          </div>
        </LedgerInstallationAccordion>

        {/* CPQ completo: el componente ya trae internamente puestos, costos,
            líneas adicionales, costos financieros, margen y totales. */}
        <div className="mt-1" data-embedded aria-label={`Margen actual ${marginPct}%`}>
          {cpqSlot}
        </div>
      </div>
    </LedgerRow>
  );
}
