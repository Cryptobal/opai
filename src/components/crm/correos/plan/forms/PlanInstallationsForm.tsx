"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AddressAutocomplete,
  type AddressResult,
} from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import type { CrmStructureInstallation } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  installations: CrmStructureInstallation[];
  onChange: (installations: CrmStructureInstallation[]) => void;
};

const emptyInstallation = (): CrmStructureInstallation => ({
  name: "",
  address: null,
  commune: null,
  city: null,
  mapsUrl: null,
  lat: null,
  lng: null,
  coverageSlots: [],
});

export function PlanInstallationsForm({ installations, onChange }: Props) {
  function updateField(
    idx: number,
    field: keyof Pick<
      CrmStructureInstallation,
      "name" | "address" | "commune" | "city" | "mapsUrl"
    >,
    value: string,
  ) {
    const next = [...installations];
    next[idx] = { ...next[idx], [field]: value || null };
    if (field === "name") next[idx].name = value;
    // Editar dirección a mano invalida coords / maps hasta revalidar.
    if (field === "address") {
      next[idx] = { ...next[idx], lat: null, lng: null };
    }
    onChange(next);
  }

  function applyAddress(idx: number, result: AddressResult) {
    const next = [...installations];
    const mapsUrl =
      Number.isFinite(result.lat) && Number.isFinite(result.lng)
        ? `https://www.google.com/maps?q=${result.lat},${result.lng}`
        : next[idx].mapsUrl;
    next[idx] = {
      ...next[idx],
      address: result.address || next[idx].address,
      city: result.city || next[idx].city,
      commune: result.commune || next[idx].commune,
      lat: result.lat,
      lng: result.lng,
      mapsUrl,
    };
    onChange(next);
  }

  function add() {
    onChange([...installations, emptyInstallation()]);
  }

  function remove(idx: number) {
    onChange(installations.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {installations.length === 0 && (
        <p className="text-[13px] text-ds-text-3">Sin instalaciones.</p>
      )}
      {installations.map((inst, i) => {
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
          <div
            key={i}
            className="space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
                Instalación {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg text-status-danger-fg ds-tap sm:h-8 sm:w-8"
                aria-label="Eliminar instalación"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <SmallField
              id={`inst-${i}-name`}
              label="Nombre"
              value={inst.name}
              onChange={(v) => updateField(i, "name", v)}
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
                onChange={(result) => applyAddress(i, result)}
                placeholder="Buscar dirección en Google Maps..."
                showMap={false}
              />
              <MapsUrlPasteInput
                onResolve={(result) => applyAddress(i, result)}
                className="mt-1.5"
              />
              {hasValidatedCoords ? (
                <p className="text-[12px] text-status-ok-fg">
                  Coordenadas validadas: {inst.lat!.toFixed(5)},{" "}
                  {inst.lng!.toFixed(5)}
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
                onChange={(v) => updateField(i, "commune", v)}
              />
              <SmallField
                id={`inst-${i}-city`}
                label="Ciudad"
                value={inst.city ?? ""}
                onChange={(v) => updateField(i, "city", v)}
              />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap hover:border-primary hover:text-primary sm:h-9"
      >
        <Plus className="h-4 w-4" /> Agregar instalación
      </button>
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
