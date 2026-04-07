"use client";

/**
 * AddressAutocomplete — usa PlaceAutocompleteElement (New Places API) con loading=async.
 * Renderiza un <input> nativo como fallback visible mientras carga, y lo reemplaza
 * con el web component una vez listo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

/* ── Script loader (singleton, reutiliza script existente) ── */

let mapsReady: Promise<void> | null = null;

function ensureGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (mapsReady) return mapsReady;

  mapsReady = new Promise<void>((resolve, reject) => {
    const win = window as any;

    // Ya cargado y listo.
    if (win.google?.maps?.importLibrary) {
      resolve();
      return;
    }

    // Script ya en el DOM (cargado por otra parte de la app) pero aún no onload.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src*="maps.googleapis.com/maps/api/js"]`
    );
    if (existing) {
      if (win.google?.maps) {
        resolve();
        return;
      }
      const onLoad = () => { cleanup(); resolve(); };
      const onErr = () => { cleanup(); mapsReady = null; reject(new Error("Google Maps script failed")); };
      const cleanup = () => { existing.removeEventListener("load", onLoad); existing.removeEventListener("error", onErr); };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onErr);
      return;
    }

    // Carga fresca con loading=async (patrón recomendado por Google).
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async&language=es&region=CL&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { mapsReady = null; reject(new Error("No se pudo cargar Google Maps")); };
    document.head.appendChild(script);
  });

  return mapsReady;
}

/* ── Helpers ── */

function parseComunaFromFormattedAddress(formatted: string): string {
  const parts = formatted.split(", ").map((p) => p.trim());
  if (parts.length >= 2 && parts[parts.length - 1] === "Chile") {
    const c = parts[1];
    if (c && c.length < 50 && !/^\d+$/.test(c)) return c;
  }
  return "";
}

type Comp = { long_name?: string; longText?: string; types: string[] };

function extractResult(
  formatted: string,
  placeId: string,
  lat: number,
  lng: number,
  rawComps: Comp[],
): AddressResult {
  const comps = rawComps.map((c) => ({ long_name: c.long_name ?? c.longText ?? "", types: c.types }));
  const get = (types: string[]) => comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? "";

  const locality = get(["locality"]);
  const admin1 = get(["administrative_area_level_1"]);
  const admin2 = get(["administrative_area_level_2"]);
  const admin3 = get(["administrative_area_level_3"]);
  const sub1 = get(["sublocality_level_1"]);
  const sub = get(["sublocality"]);
  const fromFmt = parseComunaFromFormattedAddress(formatted);

  const commune = admin3 || sub1 || sub || (locality && locality !== "Santiago" ? locality : "") || admin2 || fromFmt || locality || "";
  let city = "";
  if (admin1 && /Metropolitana|Santiago/i.test(admin1)) city = "Santiago";
  else if (locality) city = locality;
  else city = admin1 || admin2 || "";

  return { address: formatted, city, commune, region: admin1 || "", placeId, lat, lng };
}

function latLng(loc: unknown): { lat: number; lng: number } {
  if (!loc || typeof loc !== "object") return { lat: 0, lng: 0 };
  const o = loc as any;
  return {
    lat: typeof o.lat === "function" ? o.lat() : Number(o.lat ?? 0),
    lng: typeof o.lng === "function" ? o.lng() : Number(o.lng ?? 0),
  };
}

const ADDRESS_TYPES = ["street_address", "premise", "subpremise", "route"] as const;

type GmpWidget = HTMLElement & { value: string };

/* ── Componente ── */

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Buscar dirección...",
  className,
  showMap = true,
  wrapperClassName,
}: AddressAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<GmpWidget | null>(null);
  const lastParentValue = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const [ready, setReady] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // z-index para sugerencias (.pac-container y gmp prediction list)
  useEffect(() => {
    const id = "gmp-ac-zfix";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = [
      `.pac-container { z-index: 10000 !important; pointer-events: auto !important; }`,
      `gmp-place-autocomplete::part(prediction-list) { z-index: 10000 !important; }`,
      `gmp-place-autocomplete { border:0!important; outline:0!important; box-shadow:none!important; background:transparent!important; }`,
      `gmp-place-autocomplete::part(input),gmp-place-autocomplete::part(input-container) { border:0!important; outline:0!important; box-shadow:none!important; background:transparent!important; color:inherit!important; }`,
    ].join("\n");
    document.head.appendChild(s);

    const stop = (e: Event) => { if ((e.target as HTMLElement)?.closest?.(".pac-container")) e.stopPropagation(); };
    document.addEventListener("pointerdown", stop, true);
    document.addEventListener("mousedown", stop, true);
    return () => {
      document.removeEventListener("pointerdown", stop, true);
      document.removeEventListener("mousedown", stop, true);
    };
  }, []);

  const handleSelect = useCallback(async (place: any) => {
    try {
      await place.fetchFields({ fields: ["formattedAddress", "addressComponents", "location", "id"] });
      const formatted = place.formattedAddress ?? "";
      const { lat: la, lng: ln } = latLng(place.location);
      const result = extractResult(formatted, place.id ?? "", la, ln, place.addressComponents ?? []);
      setCoords({ lat: la, lng: ln });
      onChangeRef.current(result);
    } catch (err) {
      console.error("[AddressAutocomplete] fetchFields:", err);
    }
  }, []);

  // Montar el web component PlaceAutocompleteElement.
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !containerRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        await ensureGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const maps = (window as any).google?.maps;
        if (!maps?.importLibrary) return;

        const placesLib = await maps.importLibrary("places") as any;
        if (cancelled) return;

        const Ctor = placesLib.PlaceAutocompleteElement;
        if (!Ctor) {
          console.warn("[AddressAutocomplete] PlaceAutocompleteElement not available");
          return;
        }

        const el = new Ctor({
          includedRegionCodes: ["cl"],
          requestedLanguage: "es",
          requestedRegion: "cl",
          placeholder,
          includedPrimaryTypes: [...ADDRESS_TYPES],
        }) as GmpWidget;

        el.className = `w-full min-h-10 border-0 bg-transparent text-sm shadow-none outline-none pointer-events-auto ${className ?? ""}`.trim();

        const initial = valueRef.current;
        if (initial) el.value = initial;

        el.addEventListener("gmp-select", async (event: Event) => {
          const pred = (event as any).placePrediction;
          if (!pred) return;
          const place = pred.toPlace();
          if (place) await handleSelect(place);
        });

        el.addEventListener("gmp-error", (ev: Event) => {
          console.error("[AddressAutocomplete] gmp-error:", ev);
        });

        containerRef.current.appendChild(el);
        widgetRef.current = el;
        lastParentValue.current = initial;
        setReady(true);
      } catch (err) {
        console.error("[AddressAutocomplete] init:", err);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      const el = widgetRef.current;
      if (el?.parentNode) el.remove();
      widgetRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronizar valor del padre.
  useEffect(() => {
    if (value === undefined || !widgetRef.current || !ready) return;
    if (lastParentValue.current === value) return;
    lastParentValue.current = value;
    widgetRef.current.value = value;
  }, [value, ready]);

  const focusWidget = useCallback(() => {
    const el = widgetRef.current;
    if (!el) return;
    try { el.focus(); } catch {}
    const inner = (el.shadowRoot?.querySelector?.("input") ?? el.querySelector?.("input")) as HTMLInputElement | null;
    inner?.focus();
  }, []);

  if (!GOOGLE_MAPS_API_KEY) {
    return <p className="text-sm text-muted-foreground">Falta <code className="text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>.</p>;
  }

  const base = "relative flex min-h-[44px] w-full items-center rounded-lg border pl-9 pr-2 shadow-sm transition-colors focus-within:border-ring";
  const wrap = wrapperClassName ? `${base} ${wrapperClassName}` : `${base} border-input bg-background`;
  const pinColor = wrapperClassName ? "text-slate-400" : "text-muted-foreground";

  const mapUrl = coords && showMap && GOOGLE_MAPS_API_KEY
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=15&size=400x160&scale=2&markers=color:red%7C${coords.lat},${coords.lng}&key=${GOOGLE_MAPS_API_KEY}`
    : null;

  return (
    <div className="space-y-2">
      <div className="relative w-full">
        <MapPin className={`absolute left-3 top-1/2 z-[2] -translate-y-1/2 h-4 w-4 pointer-events-none ${pinColor}`} />
        <div className={cn(wrap, "cursor-text")} onClick={focusWidget}>
          {!ready && (
            <div className="pointer-events-none absolute inset-0 left-9 flex items-center text-sm text-muted-foreground">
              Cargando buscador…
            </div>
          )}
          <div
            ref={containerRef}
            className="relative z-[1] flex min-h-[40px] w-full items-center [&>gmp-place-autocomplete]:min-h-10 [&>gmp-place-autocomplete]:w-full [&>gmp-place-autocomplete]:pointer-events-auto"
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
          <img src={mapUrl} alt="Ubicación" className="w-full h-[120px] object-cover" loading="lazy" />
        </a>
      )}
    </div>
  );
}
