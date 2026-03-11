"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface RoutePoint {
  lat: number;
  lng: number;
  ts?: number;
}

interface TripRouteMapProps {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  routePoints?: RoutePoint[];
  distanceKm?: number;
  onClose?: () => void;
  /** Render inline (no modal overlay) */
  inline?: boolean;
}

export function TripRouteMap({
  startLat,
  startLng,
  endLat,
  endLng,
  routePoints,
  distanceKm,
  onClose,
  inline,
}: TripRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css" as string);

      const map = L.map(mapRef.current!, {
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 },
      ).addTo(map);

      const bounds: L.LatLngExpression[] = [];

      // Build route coordinates
      const routeCoords: L.LatLngExpression[] = [];
      routeCoords.push([startLat, startLng]);
      if (routePoints && routePoints.length > 0) {
        for (const p of routePoints) {
          routeCoords.push([p.lat, p.lng]);
        }
      }
      routeCoords.push([endLat, endLng]);

      // Draw route polyline
      if (routeCoords.length >= 2) {
        L.polyline(routeCoords, {
          color: "#10B981",
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
        bounds.push(...routeCoords);
      }

      // Start marker (green)
      L.circleMarker([startLat, startLng] as L.LatLngExpression, {
        radius: 10,
        fillColor: "#22c55e",
        color: "#fff",
        weight: 3,
        fillOpacity: 1,
      })
        .bindTooltip("Inicio", { permanent: true, direction: "top", offset: [0, -10] })
        .addTo(map);

      // End marker (red)
      L.circleMarker([endLat, endLng] as L.LatLngExpression, {
        radius: 10,
        fillColor: "#ef4444",
        color: "#fff",
        weight: 3,
        fillOpacity: 1,
      })
        .bindTooltip("Fin", { permanent: true, direction: "top", offset: [0, -10] })
        .addTo(map);

      bounds.push([startLat, startLng], [endLat, endLng]);

      // Fit bounds
      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
      }

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [startLat, startLng, endLat, endLng, routePoints]);

  if (inline) {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div ref={mapRef} className="h-[300px] w-full" />
        {distanceKm != null && (
          <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 border border-white" /> Inicio
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500 border border-white" /> Fin
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-emerald-500" /> Ruta ({distanceKm.toFixed(1)} km)
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-3xl rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Trayecto del viaje</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div ref={mapRef} className="h-[400px] w-full" />
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 border border-white" /> Inicio
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-red-500 border border-white" /> Fin
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-emerald-500" /> Ruta
            {distanceKm != null ? ` (${distanceKm.toFixed(1)} km)` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
