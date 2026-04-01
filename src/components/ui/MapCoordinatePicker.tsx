"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

interface GoogleMapMouseEvent {
  latLng?: GoogleLatLng | null;
}

interface GoogleMapInstance {
  setCenter(latLng: GoogleLatLng): void;
  setZoom(zoom: number): void;
  setMapTypeId(typeId: string): void;
  addListener(event: string, cb: (ev: GoogleMapMouseEvent) => void): void;
}

interface GoogleMarkerInstance {
  setPosition(latLng: GoogleLatLng): void;
  addListener(event: string, cb: (ev: GoogleMapMouseEvent) => void): void;
}

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

function loadMapsScript(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as unknown as { google?: { maps?: { Map?: unknown } } };
    if (w.google?.maps?.Map) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-maps-picker-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-picker-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&language=es&region=CL`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export function MapCoordinatePicker({
  lat,
  lng,
  onChange,
}: {
  lat?: number | null;
  lng?: number | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<GoogleMapInstance | null>(null);
  const markerRef = useRef<GoogleMarkerInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");

  useEffect(() => {
    let mounted = true;
    if (!MAPS_KEY || !mapRef.current) return;

    void loadMapsScript().then(() => {
      const w = window as unknown as { google?: { maps?: any } };
      if (!mounted || !mapRef.current || !w.google?.maps) return;

      const googleMaps = w.google.maps;
      const startLat = lat ?? -33.4489;
      const startLng = lng ?? -70.6693;
      const startPos = new googleMaps.LatLng(startLat, startLng);

      const map = new googleMaps.Map(mapRef.current, {
        center: startPos,
        zoom: 18,
        mapTypeId: mapType,
        streetViewControl: false,
        fullscreenControl: true,
        mapTypeControl: true,
      });
      const marker = new googleMaps.Marker({
        position: startPos,
        map,
        draggable: true,
      });

      map.addListener("click", (ev: GoogleMapMouseEvent) => {
        if (!ev.latLng) return;
        marker.setPosition(ev.latLng);
        onChange({ lat: ev.latLng.lat(), lng: ev.latLng.lng() });
      });
      marker.addListener("dragend", (ev: GoogleMapMouseEvent) => {
        if (!ev.latLng) return;
        onChange({ lat: ev.latLng.lat(), lng: ev.latLng.lng() });
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      setReady(true);
      onChange({ lat: startLat, lng: startLng });
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const w = window as unknown as { google?: { maps?: any } };
    if (!ready || !w.google?.maps || !mapInstanceRef.current || !markerRef.current) return;
    if (lat == null || lng == null) return;
    const pos = new w.google.maps.LatLng(lat, lng);
    markerRef.current.setPosition(pos);
    mapInstanceRef.current.setCenter(pos);
  }, [lat, lng, ready]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setMapTypeId(mapType);
  }, [mapType]);

  if (!MAPS_KEY) {
    return (
      <div className="rounded border border-dashed border-border p-3 text-sm text-muted-foreground">
        Falta `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` para usar mapa interactivo.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={mapType === "roadmap" ? "default" : "outline"}
          size="sm"
          onClick={() => setMapType("roadmap")}
        >
          Mapa
        </Button>
        <Button
          type="button"
          variant={mapType === "satellite" ? "default" : "outline"}
          size="sm"
          onClick={() => setMapType("satellite")}
        >
          Satélite
        </Button>
      </div>
      <div ref={mapRef} className="h-[420px] w-full rounded border border-border" />
      <p className="text-xs text-muted-foreground">
        Haz click o arrastra el pin para fijar coordenadas exactas del checkpoint.
      </p>
    </div>
  );
}
