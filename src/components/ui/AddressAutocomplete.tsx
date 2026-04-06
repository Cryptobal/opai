"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

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

/** Carga Maps JS API; luego `importLibrary("places")` usa Places API (New), no el Autocomplete legacy. */
function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (scriptLoaded && window.google?.maps?.importLibrary) {
      resolve();
      return;
    }
    loadCallbacks.push(() => resolve());
    if (scriptLoading) return;
    scriptLoading = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async&language=es&region=CL&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      scriptLoading = false;
      reject(new Error("No se pudo cargar Google Maps"));
    };
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
 */
function parseComunaFromFormattedAddress(formatted: string): string {
  const parts = formatted.split(", ").map((p) => p.trim());
  if (parts.length >= 2 && parts[parts.length - 1] === "Chile") {
    const comuna = parts[1];
    if (comuna && comuna.length < 50 && !/^\d+$/.test(comuna)) {
      return comuna;
    }
  }
  return "";
}

type LegacyComponent = { long_name: string; types: string[] };

/** Convierte respuesta legacy (PlacesService) o nueva (Place.fetchFields) a componentes unificados. */
function normalizeComponents(
  raw: Array<{ long_name?: string; longText?: string; types: string[] }>,
): LegacyComponent[] {
  return raw.map((c) => ({
    long_name: c.long_name ?? c.longText ?? "",
    types: c.types,
  }));
}

function extractFromComponents(
  formatted: string,
  placeId: string,
  lat: number,
  lng: number,
  addressComponents: LegacyComponent[],
): AddressResult {
  const comps = addressComponents;
  const getByType = (types: string[]) =>
    comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? "";

  const locality = getByType(["locality"]);
  const admin1 = getByType(["administrative_area_level_1"]);
  const admin2 = getByType(["administrative_area_level_2"]);
  const admin3 = getByType(["administrative_area_level_3"]);
  const sublocality1 = getByType(["sublocality_level_1"]);
  const sublocality = getByType(["sublocality"]);
  const fromFormatted = parseComunaFromFormattedAddress(formatted);

  const commune =
    admin3 ||
    sublocality1 ||
    sublocality ||
    (locality && locality !== "Santiago" ? locality : "") ||
    admin2 ||
    fromFormatted ||
    locality ||
    "";

  let city = "";
  if (admin1 && /Metropolitana|Santiago/i.test(admin1)) {
    city = "Santiago";
  } else if (locality) {
    city = locality;
  } else {
    city = admin1 || admin2 || "";
  }

  return {
    address: formatted,
    city,
    commune,
    region: admin1 || "",
    placeId,
    lat,
    lng,
  };
}

function latLngFromUnknown(loc: unknown): { lat: number; lng: number } {
  if (!loc || typeof loc !== "object") return { lat: 0, lng: 0 };
  const o = loc as { lat?: unknown; lng?: unknown };
  const lat = typeof o.lat === "function" ? (o.lat as () => number)() : Number(o.lat ?? 0);
  const lng = typeof o.lng === "function" ? (o.lng as () => number)() : Number(o.lng ?? 0);
  return { lat, lng };
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Buscar dirección...",
  className,
  showMap = true,
}: AddressAutocompleteProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<HTMLElement | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sugerencias sobre modales (Radix): lista nueva (gmp) + legacy .pac por si acaso
  useEffect(() => {
    const styleId = "gmp-place-autocomplete-z";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      gmp-place-autocomplete::part(prediction-list),
      gmp-basic-place-autocomplete::part(prediction-list) {
        z-index: 10000 !important;
      }
      .pac-container { z-index: 10000 !important; pointer-events: auto !important; }
    `;
    document.head.appendChild(style);

    const handler = (e: PointerEvent | MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.(".pac-container") || target?.closest?.('[class*="prediction"]')) {
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

  const handleNewPlaceSelect = useCallback(
    async (place: {
      fetchFields: (o: { fields: string[] }) => Promise<void>;
      formattedAddress?: string;
      id?: string;
      addressComponents?: Array<{ longText?: string; types: string[] }>;
      location?: unknown;
    }) => {
      await place.fetchFields({
        fields: ["formattedAddress", "addressComponents", "location", "id"],
      });
      const formatted = place.formattedAddress ?? "";
      const { lat, lng } = latLngFromUnknown(place.location);
      const comps = normalizeComponents(place.addressComponents ?? []);
      const result = extractFromComponents(
        formatted,
        place.id ?? "",
        lat,
        lng,
        comps,
      );
      setCoords({ lat: result.lat, lng: result.lng });
      onChangeRef.current(result);
    },
    [],
  );

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !wrapRef.current) return;

    let cancelled = false;
    const container = wrapRef.current;
    const initialAddressValue = value;

    (async () => {
      try {
        await loadGoogleMapsScript();
        if (cancelled || !container) return;
        const maps = window.google?.maps;
        if (!maps?.importLibrary) return;

        const placesLib = (await maps.importLibrary("places")) as {
          PlaceAutocompleteElement?: new (opts?: Record<string, unknown>) => HTMLElement & {
            value: string;
            addEventListener: (type: string, fn: (e: unknown) => void) => void;
          };
        };

        const Ctor = placesLib.PlaceAutocompleteElement;
        if (!Ctor) return;

        const el = new Ctor({
          includedRegionCodes: ["cl"],
          requestedLanguage: "es",
          requestedRegion: "cl",
          placeholder,
        });
        el.className = `w-full min-h-10 text-sm ${className ?? ""}`.trim();
        if (initialAddressValue !== undefined) {
          (el as { value: string }).value = initialAddressValue;
        }

        const onSelect = async (event: Event) => {
          const e = event as unknown as {
            placePrediction?: { toPlace: () => unknown };
          };
          const place = e.placePrediction?.toPlace() as Parameters<typeof handleNewPlaceSelect>[0] | undefined;
          if (!place) return;
          await handleNewPlaceSelect(place);
        };

        el.addEventListener("gmp-select", onSelect);
        container.appendChild(el);
        acRef.current = el;

        el.addEventListener("gmp-error", (ev) => {
          console.error("[AddressAutocomplete] Google Places:", ev);
        });
      } catch (err) {
        console.error("[AddressAutocomplete]", err);
      }
    })();

    return () => {
      cancelled = true;
      const el = acRef.current;
      if (el?.parentNode) {
        el.remove();
      }
      acRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montaje único; placeholder/className vía re-mount si hiciera falta
  }, []);

  useEffect(() => {
    if (value === undefined || !acRef.current) return;
    const el = acRef.current as { value?: string };
    if (el.value !== value) el.value = value;
  }, [value]);

  const showMapImage = coords && showMap && GOOGLE_MAPS_API_KEY;
  const mapUrl = showMapImage
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=15&size=400x160&scale=2&markers=color:red%7C${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`
    : null;

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <p className="text-sm text-muted-foreground">
        Falta configurar <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative w-full">
        <MapPin className="absolute left-3 top-1/2 z-[1] -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <div ref={wrapRef} className="w-full pl-9 [&>gmp-place-autocomplete]:w-full" />
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
