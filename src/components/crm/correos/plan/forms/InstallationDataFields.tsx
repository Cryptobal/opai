"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AddressAutocomplete,
  type AddressResult,
} from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import type { CrmStructureInstallation } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  installation: CrmStructureInstallation;
  index: number;
  onChange: (next: CrmStructureInstallation) => void;
  onRemove?: () => void;
  /** Si false, oculta el botón eliminar (p. ej. cuando no hay callback). */
  showRemove?: boolean;
};

export function InstallationDataFields({
  installation: inst,
  index: i,
  onChange,
  onRemove,
  showRemove = true,
}: Props) {
  function updateField(
    field: keyof Pick<
      CrmStructureInstallation,
      "name" | "address" | "commune" | "city" | "mapsUrl"
    >,
    value: string,
  ) {
    let next: CrmStructureInstallation = { ...inst, [field]: value || null };
    if (field === "name") next = { ...next, name: value };
    if (field === "address") {
      next = { ...next, lat: null, lng: null };
    }
    onChange(next);
  }

  function applyAddress(result: AddressResult) {
    const mapsUrl =
      Number.isFinite(result.lat) && Number.isFinite(result.lng)
        ? `https://www.google.com/maps?q=${result.lat},${result.lng}`
        : inst.mapsUrl;
    onChange({
      ...inst,
      address: result.address || inst.address,
      city: result.city || inst.city,
      commune: result.commune || inst.commune,
      lat: result.lat,
      lng: result.lng,
      mapsUrl,
    });
  }

  const mapsHref =
    inst.mapsUrl ||
    (inst.lat != null && inst.lng != null
      ? `https://www.google.com/maps?q=${inst.lat},${inst.lng}`
      : null);
  const hasValidatedCoords =
    typeof inst.lat === "number" &&
    Number.isFinite(inst.lat) &&
    typeof inst.lng === "number" &&
    Number.isFinite(inst.lng);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
          Datos de la instalación
        </span>
        {showRemove && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg text-status-danger-fg ds-tap sm:h-8 sm:w-8"
            aria-label="Eliminar instalación"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <SmallField
        id={`inst-${i}-name`}
        label="Nombre"
        value={inst.name}
        onChange={(v) => updateField("name", v)}
      />
      <div className="relative z-[5] space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[12px] text-ds-text-3">
            Dirección (Google Maps)
          </Label>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-status-ok-fg"
              title="Abrir en Google Maps"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir en Maps
            </a>
          )}
        </div>
        <AddressAutocomplete
          value={inst.address ?? ""}
          onChange={applyAddress}
          placeholder="Buscar dirección en Google Maps..."
          showMap={false}
        />
        <MapsUrlPasteInput onResolve={applyAddress} className="mt-1.5" />
        {hasValidatedCoords ? (
          <p className="text-[12px] text-status-ok-fg">
            Coordenadas validadas: {inst.lat!.toFixed(5)}, {inst.lng!.toFixed(5)}
          </p>
        ) : inst.address ? (
          <p className="text-[12px] text-status-warn-fg">
            Seleccioná una sugerencia de Maps o pegá un link para validar.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SmallField
          id={`inst-${i}-commune`}
          label="Comuna"
          value={inst.commune ?? ""}
          onChange={(v) => updateField("commune", v)}
        />
        <SmallField
          id={`inst-${i}-city`}
          label="Ciudad"
          value={inst.city ?? ""}
          onChange={(v) => updateField("city", v)}
        />
      </div>
    </div>
  );
}

function SmallField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[12px] text-ds-text-3">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-[13px] sm:h-9"
      />
    </div>
  );
}
