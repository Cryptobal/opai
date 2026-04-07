"use client";

/**
 * AddressAutocomplete — usa la API legacy google.maps.places.Autocomplete sobre un
 * <input> HTML nativo para garantizar interactividad plena (sin shadow DOM ni web component).
 */

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

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
  wrapperClassName?: string;
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (scriptLoaded && window.google?.maps) {
      resolve();
      return;
    }
    loadCallbacks.push(() => resolve());
    if (scriptLoading) return;
    scriptLoading = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async&language=es&region=CL`;
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

function parseComunaFromFormattedAddress(formatted: string): string {
  const parts = formatted.split(", ").map((p) => p.trim());
  if (parts.length >= 2 && parts[parts.length - 1] === "Chile") {
    const comuna = parts[1];
    if (comuna && comuna.length < 50 && !/^\d+$/.test(comuna)) return comuna;
  }
  return "";
}

type LegacyComponent = { long_name: string; types: string[] };

function extractFromComponents(
  formatted: string,
  placeId: string,
  lat: number,
  lng: number,
  comps: LegacyComponent[],
): AddressResult {
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

  return { address: formatted, city, commune, region: admin1 || "", placeId, lat, lng };
}

/** Tipos mínimos para la API legacy de Places (sin @types/google.maps). */
interface LegacyAutocomplete {
  addListener: (event: string, handler: () => void) => { remove: () => void };
  getPlace: () => {
    formatted_address?: string;
    address_components?: LegacyComponent[];
    geometry?: { location: { lat: () => number; lng: () => number } };
    place_id?: string;
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Buscar dirección...",
  className,
  showMap = true,
  wrapperClassName,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acInstanceRef = useRef<LegacyAutocomplete | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Texto visible en el input; se sincroniza desde el padre solo cuando el padre cambia value
  // (evita pisar lo que el usuario escribe).
  const [inputValue, setInputValue] = useState(value ?? "");
  const lastParentValueRef = useRef(value);

  useEffect(() => {
    if (value === undefined) return;
    if (value === lastParentValueRef.current) return;
    lastParentValueRef.current = value;
    setInputValue(value);
  }, [value]);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Inyectar z-index para el dropdown .pac-container una sola vez.
  useEffect(() => {
    const styleId = "pac-container-zfix";
    if (document.getElementById(styleId)) return;
    const s = document.createElement("style");
    s.id = styleId;
    s.textContent = `.pac-container { z-index: 10000 !important; pointer-events: auto !important; }`;
    document.head.appendChild(s);

    const handler = (e: PointerEvent | MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.(".pac-container")) e.stopPropagation();
    };
    document.addEventListener("pointerdown", handler, true);
    document.addEventListener("mousedown", handler, true);
    return () => {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("mousedown", handler, true);
    };
  }, []);

  // Montar el Autocomplete legacy sobre el input nativo.
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !inputRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        await loadGoogleMapsScript();
        if (cancelled || !inputRef.current) return;

        const places = (window.google?.maps as unknown as { places?: { Autocomplete: new (el: HTMLInputElement, opts?: Record<string, unknown>) => LegacyAutocomplete } })?.places;
        if (!places?.Autocomplete) return;

        const ac = new places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "cl" },
          types: ["address"],
          fields: ["formatted_address", "address_components", "geometry", "place_id"],
        });
        acInstanceRef.current = ac;

        listenerRef.current = ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          const comps: LegacyComponent[] = place.address_components ?? [];
          const result = extractFromComponents(
            place.formatted_address ?? "",
            place.place_id ?? "",
            lat,
            lng,
            comps,
          );
          setInputValue(result.address);
          lastParentValueRef.current = result.address;
          setCoords({ lat, lng });
          onChangeRef.current(result);
        });
      } catch (err) {
        console.error("[AddressAutocomplete]", err);
      }
    })();

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      listenerRef.current = null;
      acInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const wrapperBaseClasses =
    "relative flex min-h-[44px] w-full items-center rounded-lg border pl-9 pr-2 shadow-sm transition-colors focus-within:border-ring";
  const wrapperClasses = wrapperClassName
    ? `${wrapperBaseClasses} ${wrapperClassName}`
    : `${wrapperBaseClasses} border-input bg-background`;

  const mapPinColor = wrapperClassName ? "text-slate-400" : "text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className="relative w-full">
        <MapPin
          className={`absolute left-3 top-1/2 z-[2] -translate-y-1/2 h-4 w-4 pointer-events-none ${mapPinColor}`}
        />
        <div className={cn(wrapperClasses, "cursor-text")}>
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            className={cn(
              "w-full min-h-[40px] bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground",
              className,
            )}
          />
        </div>
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
