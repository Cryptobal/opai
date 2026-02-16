"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isGoogleMapsUrl, parseGoogleMapsUrl } from "@/lib/google-maps-url";
import type { AddressResult } from "@/components/ui/AddressAutocomplete";
import { Link2, Loader2 } from "lucide-react";

interface MapsUrlPasteInputProps {
  onResolve: (result: AddressResult) => void;
  disabled?: boolean;
  className?: string;
}

/** Misma lógica de extractComponents que AddressAutocomplete usa. */
function extractFromGeocoderResult(result: google.maps.GeocoderResult): {
  address: string;
  city: string;
  commune: string;
} {
  const formatted = result.formatted_address || "";
  const comps = result.address_components || [];
  const getByType = (types: string[]) =>
    comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? "";

  const locality = getByType(["locality"]);
  const admin1 = getByType(["administrative_area_level_1"]);
  const admin2 = getByType(["administrative_area_level_2"]);
  const admin3 = getByType(["administrative_area_level_3"]);
  const sublocality1 = getByType(["sublocality_level_1"]);
  const sublocality = getByType(["sublocality"]);

  // Parsear comuna desde formatted_address: "Calle, Comuna, Región, Chile"
  const parts = formatted.split(", ").map((p) => p.trim());
  let fromFormatted = "";
  if (parts.length >= 2 && parts[parts.length - 1] === "Chile") {
    const c = parts[1];
    if (c && c.length < 50 && !/^\d+$/.test(c)) fromFormatted = c;
  }

  const commune =
    admin3 ||
    sublocality1 ||
    sublocality ||
    (locality && locality !== "Santiago" ? locality : "") ||
    admin2 ||
    fromFormatted ||
    locality ||
    "";

  let city: string;
  if (admin1 && /Metropolitana|Santiago/i.test(admin1)) {
    city = "Santiago";
  } else if (locality) {
    city = locality;
  } else {
    city = admin1 || admin2 || "";
  }

  return { address: formatted, city, commune };
}

/** Reverse geocoding usando la Geocoder API del browser (la API key funciona con referer). */
function reverseGeocodeInBrowser(
  lat: number,
  lng: number
): Promise<{ address: string; city: string; commune: string }> {
  return new Promise((resolve, reject) => {
    const g = typeof window !== "undefined" ? window.google : undefined;
    if (!g?.maps?.Geocoder) {
      reject(new Error("Google Maps no está cargado."));
      return;
    }
    const geocoder = new g.maps.Geocoder();
    geocoder.geocode(
      { location: { lat, lng } },
      (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
        if (status === "OK" && results && results.length > 0) {
          resolve(extractFromGeocoderResult(results[0]));
        } else if (status === "ZERO_RESULTS") {
          resolve({ address: `${lat}, ${lng}`, city: "", commune: "" });
        } else {
          reject(new Error(`Geocoding falló: ${status}`));
        }
      }
    );
  });
}

/**
 * Input para pegar una URL de Google Maps; extrae coordenadas, hace reverse geocoding
 * en el navegador y llama a onResolve con dirección, ciudad, comuna y lat/lng.
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
      // 1. Intentar parsear coordenadas directamente de la URL (URL larga)
      let coords = parseGoogleMapsUrl(trimmed);

      // 2. Si es un enlace corto, pedir al servidor que lo resuelva
      if (!coords) {
        const res = await fetch("/api/geocode/reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Error al resolver la URL.");
          return;
        }
        if (data.lat != null && data.lng != null) {
          coords = { lat: data.lat, lng: data.lng };
        }
      }

      if (!coords) {
        setError("No se pudieron extraer coordenadas de la URL.");
        return;
      }

      // 3. Reverse geocoding en el browser (la API key funciona con referer)
      const geo = await reverseGeocodeInBrowser(coords.lat, coords.lng);

      const result: AddressResult = {
        address: geo.address,
        city: geo.city,
        commune: geo.commune,
        lat: coords.lat,
        lng: coords.lng,
      };
      onResolve(result);
      setUrlInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión.");
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
