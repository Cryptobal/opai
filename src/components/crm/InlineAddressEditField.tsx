"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DetailFieldDisplay } from "@/components/opai/DetailField";
import {
  AddressAutocomplete,
  type AddressResult,
} from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { hasValidInstallationCoords } from "@/lib/crm/installation-address";

type Phase = "idle" | "editing" | "saving" | "saved" | "error";

export type GeoreferencedAddressPayload = {
  address: string;
  city: string | null;
  commune: string | null;
  region: string | null;
  placeId: string | null;
  lat: number;
  lng: number;
};

/** @deprecated Usar GeoreferencedAddressPayload */
export type InstallationAddressPayload = GeoreferencedAddressPayload;

interface InlineAddressEditFieldProps {
  label?: string;
  value: string | null;
  canEdit: boolean;
  placeholder?: string;
  className?: string;
  /** Persiste dirección + comuna/ciudad/región + coordenadas desde Google Maps. */
  onCommit: (payload: GeoreferencedAddressPayload) => Promise<void>;
}

/**
 * Edición inline de dirección georreferenciada (Google Places).
 * Misma UX en instalaciones CRM y ficha de personas.
 */
export function InlineAddressEditField({
  label = "Dirección",
  value,
  canEdit,
  placeholder = "—",
  className,
  onCommit,
}: InlineAddressEditFieldProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const [draftAddress, setDraftAddress] = useState(value ?? "");

  useEffect(() => {
    if (phase === "idle" || phase === "saved") {
      setDraftAddress(value ?? "");
    }
  }, [value, phase]);

  const startEdit = useCallback(() => {
    if (!canEdit) return;
    setDraftAddress(value ?? "");
    setError(null);
    setPhase("editing");
  }, [canEdit, value]);

  const cancel = useCallback(() => {
    setDraftAddress(value ?? "");
    setError(null);
    setPhase("idle");
  }, [value]);

  const saveFromMaps = useCallback(
    async (result: AddressResult) => {
      if (!result.address?.trim()) {
        setError("Selecciona una dirección desde Google Maps");
        setPhase("error");
        return;
      }
      if (!hasValidInstallationCoords(result.lat, result.lng)) {
        setError("Debes seleccionar la dirección desde Google Maps");
        setPhase("error");
        return;
      }

      setPhase("saving");
      setError(null);
      try {
        await onCommit({
          address: result.address.trim(),
          city: result.city?.trim() || null,
          commune: result.commune?.trim() || null,
          region: result.region?.trim() || null,
          placeId: result.placeId?.trim() || null,
          lat: result.lat,
          lng: result.lng,
        });
        setDraftAddress(result.address.trim());
        setPhase("saved");
        window.setTimeout(() => setPhase("idle"), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar");
        setPhase("error");
      }
    },
    [onCommit]
  );

  if (!canEdit) {
    return (
      <DetailFieldDisplay
        label={label}
        value={value}
        placeholder={placeholder}
        className={className}
      />
    );
  }

  const statusHint =
    phase === "saving" ? (
      <span className="inline-flex items-center gap-1 text-[12px] font-normal normal-case tracking-normal text-ds-text-3">
        <Loader2 className="h-3 w-3 animate-spin" /> Guardando
      </span>
    ) : phase === "saved" ? (
      <span className="inline-flex items-center gap-1 text-[12px] font-normal normal-case tracking-normal text-status-ok-fg">
        <Check className="h-3 w-3" /> Guardado
      </span>
    ) : null;

  if (phase === "editing" || phase === "error" || phase === "saving") {
    return (
      <div
        className={cn(
          "min-w-0 relative pl-3 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:rounded-full before:bg-primary",
          className
        )}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-ds-text-3 flex items-center gap-1.5">
            {label}
            {statusHint}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-ds-text-3"
            onClick={cancel}
            disabled={phase === "saving"}
            aria-label="Cancelar edición de dirección"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <AddressAutocomplete
          value={draftAddress}
          onChange={(result) => {
            setDraftAddress(result.address);
            // Solo persiste cuando hay coordenadas reales (selección Maps / URL).
            if (hasValidInstallationCoords(result.lat, result.lng)) {
              void saveFromMaps(result);
            } else {
              setError("Selecciona una sugerencia de Google Maps para georreferenciar");
              setPhase("error");
            }
          }}
          placeholder="Buscar dirección en Google Maps..."
          showMap={false}
        />
        <MapsUrlPasteInput
          onResolve={(result) => void saveFromMaps(result)}
          disabled={phase === "saving"}
          className="mt-1.5"
        />
        <p className="mt-1.5 text-[12px] text-ds-text-3">
          Elige una sugerencia de Google Maps (o pega un enlace) para guardar lat/lng, comuna y ciudad.
        </p>
        {error && (
          <p className="mt-1 text-[12px] text-status-danger-fg" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={className}
    >
      <DetailFieldDisplay
        label={label}
        value={value}
        placeholder={placeholder}
        className={cn(phase === "saved" && "motion-safe:bg-status-ok-soft/40 rounded-md")}
        accent={hover}
        statusHint={statusHint}
        interactive={{
          onClick: startEdit,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              startEdit();
            }
          },
          tabIndex: 0,
          "aria-label": `Editar ${label}`,
          role: "button",
        }}
        trailing={
          <Pencil
            className={cn(
              "h-3.5 w-3.5 text-ds-text-3 transition-opacity",
              hover ? "opacity-100" : "opacity-0"
            )}
            aria-hidden
          />
        }
      />
    </div>
  );
}
