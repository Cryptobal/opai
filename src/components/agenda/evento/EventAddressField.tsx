"use client";

import type { JSX } from "react";
import { ExternalLink } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  AddressAutocomplete,
  type AddressResult,
} from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";

export type EventAddressValue = {
  address: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl?: string | null;
};

export function EventAddressField({
  address,
  lat,
  lng,
  mapsUrl,
  installationLocation,
  placeholder = "Dirección del evento…",
  onChange,
}: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  mapsUrl?: string | null;
  installationLocation?: {
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    mapsUrl?: string | null;
  } | null;
  placeholder?: string;
  onChange: (next: EventAddressValue) => void;
}): JSX.Element {
  const applyAddress = (result: AddressResult) => {
    const nextMaps =
      Number.isFinite(result.lat) && Number.isFinite(result.lng)
        ? `https://www.google.com/maps?q=${result.lat},${result.lng}`
        : mapsUrl ?? null;
    onChange({
      address: result.address || address || null,
      lat: result.lat,
      lng: result.lng,
      mapsUrl: nextMaps,
    });
  };

  const mapsHref =
    mapsUrl ||
    (lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null);
  const hasValidatedCoords =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng);
  const instAddress = installationLocation?.address?.trim() || "";
  const canUseInstallation =
    Boolean(instAddress) &&
    instAddress !== (address ?? "").trim();

  return (
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
        value={address ?? ""}
        onChange={applyAddress}
        placeholder={placeholder}
        showMap={false}
      />
      <MapsUrlPasteInput onResolve={applyAddress} className="mt-1.5" />
      {canUseInstallation && (
        <button
          type="button"
          onClick={() =>
            onChange({
              address: instAddress,
              lat: installationLocation?.lat ?? null,
              lng: installationLocation?.lng ?? null,
              mapsUrl:
                installationLocation?.mapsUrl ??
                (installationLocation?.lat != null &&
                installationLocation?.lng != null
                  ? `https://www.google.com/maps?q=${installationLocation.lat},${installationLocation.lng}`
                  : null),
            })
          }
          className="text-left text-[12px] text-primary underline-offset-2 hover:underline"
        >
          Usar dirección de la instalación
        </button>
      )}
      {hasValidatedCoords ? (
        <p className="text-[12px] text-status-ok-fg">
          Coordenadas validadas: {lat!.toFixed(5)}, {lng!.toFixed(5)}
        </p>
      ) : address ? (
        <p className="text-[12px] text-status-warn-fg">
          Seleccioná una sugerencia de Maps o pegá un link para validar.
        </p>
      ) : (
        <p className="text-[12px] text-ds-text-4">
          Queda en la agenda y en Google Calendar como ubicación del evento.
        </p>
      )}
    </div>
  );
}
