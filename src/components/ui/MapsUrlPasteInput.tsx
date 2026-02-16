"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isGoogleMapsUrl } from "@/lib/google-maps-url";
import type { AddressResult } from "@/components/ui/AddressAutocomplete";
import { Link2, Loader2 } from "lucide-react";

interface MapsUrlPasteInputProps {
  onResolve: (result: AddressResult) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Input para pegar una URL de Google Maps; extrae coordenadas, hace reverse geocoding
 * y llama a onResolve con dirección, ciudad, comuna y lat/lng.
 */
export function MapsUrlPasteInput({
  onResolve,
  disabled = false,
  className,
}: MapsUrlPasteInputProps) {
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    if (!isGoogleMapsUrl(trimmed)) {
      setError("No es una URL de Google Maps válida.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/geocode/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al obtener la dirección.");
        return;
      }

      const result: AddressResult = {
        address: data.address || "",
        city: data.city || "",
        commune: data.commune || "",
        lat: data.lat ?? 0,
        lng: data.lng ?? 0,
      };
      onResolve(result);
      setUrlInput("");
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">
        O pegar URL de Google Maps
      </Label>
      <div className="flex gap-2 mt-1">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setError(null);
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData("text")?.trim() || "";
              if (isGoogleMapsUrl(pasted)) {
                setUrlInput(pasted);
                setError(null);
              }
            }}
            placeholder="https://www.google.com/maps/... o maps.app.goo.gl/..."
            className="pl-9 bg-background text-foreground border-input text-sm"
            disabled={disabled || loading}
          />
        </div>
        <button
          type="button"
          onClick={handleResolve}
          disabled={disabled || loading || !urlInput.trim()}
          className="shrink-0 px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Usar"
          )}
        </button>
      </div>
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
