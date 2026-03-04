"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

/** Minimal types for Google Places API (no @types/google.maps dependency) */
interface PlaceResult {
  formatted_address?: string;
  place_id?: string;
  geometry?: { location?: { lat(): number; lng(): number } };
  address_components?: Array<{ long_name: string; types: string[] }>;
}

interface GoogleMapsAutocomplete {
  getPlace(): PlaceResult;
  addListener(event: string, callback: () => void): void;
}

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (input: HTMLInputElement, opts?: unknown) => GoogleMapsAutocomplete;
        };
      };
    };
  }
}

export type AddressResult = {
  address: string;
  city: string;
  commune: string;
  region?: string;
  placeId?: string;
  lat: number;
  lng: number;
};

interface AddressAutocompleteProps {
  value?: string;
  onChange: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
  showMap?: boolean;
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve) => {
    if (scriptLoaded && window.google?.maps?.places) {
      resolve();
      return;
    }
    loadCallbacks.push(resolve);
    if (scriptLoading) return;
    scriptLoading = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&language=es&region=CL`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      scriptLoaded = true;
      loadCallbacks.forEach((cb) => cb());
      loadCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

/**
 * En Chile el formatted_address suele ser: "Calle, Comuna, Región, Chile"
 * Ej: "Lo Fontecilla 201, Las Condes, Región Metropolitana de Santiago, Chile"
 */
function parseComunaFromFormattedAddress(formatted: string): string {
  const parts = formatted.split(", ").map((p) => p.trim());
  if (parts.length >= 2 && parts[parts.length - 1] === "Chile") {
    // parts[1] suele ser la comuna (Las Condes, Providencia, etc.)
    const comuna = parts[1];
    if (comuna && comuna.length < 50 && !/^\d+$/.test(comuna)) {
      return comuna;
    }
  }
  return "";
}

function extractComponents(place: PlaceResult): Partial<AddressResult> {
  const formatted = place.formatted_address || "";
  const result: Partial<AddressResult> = {
    address: formatted,
    placeId: place.place_id || "",
    lat: place.geometry?.location?.lat() ?? 0,
    lng: place.geometry?.location?.lng() ?? 0,
  };

  const comps = place.address_components || [];
  const getByType = (types: string[]) =>
    comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? "";

  const locality = getByType(["locality"]);
  const admin1 = getByType(["administrative_area_level_1"]); // Región
  const admin2 = getByType(["administrative_area_level_2"]); // Provincia
  const admin3 = getByType(["administrative_area_level_3"]);
  const sublocality1 = getByType(["sublocality_level_1"]);
  const sublocality = getByType(["sublocality"]);

  // Comuna: admin3 y sublocality suelen ser la comuna en Chile; locality a veces es Santiago (ciudad)
  // Fallback: parsear desde formatted_address "Calle, Comuna, Región, Chile"
  const fromFormatted = parseComunaFromFormattedAddress(formatted);
  result.commune =
    admin3 ||
    sublocality1 ||
    sublocality ||
    (locality && locality !== "Santiago" ? locality : "") ||
    admin2 ||
    fromFormatted ||
    locality ||
    "";

  // Ciudad: en Región Metropolitana siempre "Santiago"; si no, locality o región
  if (admin1 && /Metropolitana|Santiago/i.test(admin1)) {
    result.city = "Santiago";
  } else if (locality) {
    result.city = locality;
  } else {
    result.city = admin1 || admin2 || "";
  }
  result.region = admin1 || "";

  return result;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Buscar dirección...",
  className,
  showMap = true,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<GoogleMapsAutocomplete | null>(null);
  const [inputValue, setInputValue] = useState(value || "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const handlePlaceSelect = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry) return;

    const components = extractComponents(place);
    const result: AddressResult = {
      address: components.address || "",
      city: components.city || "",
      commune: components.commune || "",
      region: components.region || "",
      placeId: components.placeId || "",
      lat: components.lat ?? 0,
      lng: components.lng ?? 0,
    };

    setInputValue(result.address);
    setCoords({ lat: result.lat, lng: result.lng });
    onChange(result);
  }, [onChange]);

  // Fix: Google Places .pac-container CSS is in globals.css for z-index.
  // We still need this useEffect to prevent Radix UI dialogs from closing
  // when clicking on Google Places suggestions.
  useEffect(() => {
    // Evitar que otros listeners intercepten el click en las sugerencias
    const handler = (e: PointerEvent | MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.(".pac-container")) {
        e.stopPropagation();
      }
    };
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("mousedown", handler, true);
    return () => {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("mousedown", handler, true);
    };
  }, []);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !inputRef.current) return;

    let mounted = true;
    loadGoogleMapsScript().then(() => {
      if (!mounted || !inputRef.current) return;

      if (autocompleteRef.current) return; // already initialized

      const g = typeof window !== "undefined" ? window.google : undefined;
      if (!g?.maps?.places?.Autocomplete) return;

      autocompleteRef.current = new g.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "cl" },
        fields: ["formatted_address", "geometry", "address_components", "place_id"],
        types: ["address"],
      });

      autocompleteRef.current.addListener("place_changed", handlePlaceSelect);
    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value !== undefined && value !== inputValue) {
      setInputValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const showMapImage = coords && showMap && GOOGLE_MAPS_API_KEY;
  const mapUrl = showMapImage
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=15&size=400x160&scale=2&markers=color:red%7C${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`
    : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className={`pl-9 ${className || ""}`}
        />
      </div>
      {mapUrl && (
        <a
          href={`https://www.google.com/maps/@${coords!.lat},${coords!.lng},17z`}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mapUrl}
            alt="Ubicación"
            className="w-full h-[120px] object-cover"
            loading="lazy"
          />
        </a>
      )}
    </div>
  );
}
