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

      // Construye la ruta a dibujar. Prioridad:
      // 1) routePoints (breadcrumbs GPS reales del viaje, si los hay)
      // 2) geometría de la ruta por carretera de Google (se carga async abajo)
      // 3) línea recta inicio→fin como último recurso
      const buildBaseCoords = (): L.LatLngExpression[] => {
        const coords: L.LatLngExpression[] = [[startLat, startLng]];
        if (routePoints && routePoints.length > 0) {
          for (const p of routePoints) coords.push([p.lat, p.lng]);
        }
        coords.push([endLat, endLng]);
        return coords;
      };

      const routeCoords = buildBaseCoords();
      const hasGpsTrack = !!(routePoints && routePoints.length > 0);

      // Polyline inicial (recta o GPS). Se reemplaza por la ruta de calles si
      // Google responde y no hay track GPS propio.
      let routeLine: L.Polyline | null = null;
      if (routeCoords.length >= 2) {
        routeLine = L.polyline(routeCoords, {
          color: "#10B981",
          weight: 4,
          opacity: 0.85,
        }).addTo(map);
        bounds.push(...routeCoords);
      }

      // Si no hay track GPS, pide a Google la geometría real de la ruta por
      // carretera y reemplaza la línea recta por el trayecto en auto.
      if (!hasGpsTrack) {
        fetch("/api/finance/trips/route-geometry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startLat, startLng, endLat, endLng }),
        })
          .then((r) => r.json())
          .then((res) => {
            const path: { lat: number; lng: number }[] = res?.data?.path ?? [];
            if (!mapInstanceRef.current || path.length < 2) return;
            const roadCoords: L.LatLngExpression[] = path.map((p) => [p.lat, p.lng]);
            if (routeLine) routeLine.remove();
            L.polyline(roadCoords, {
              color: "#10B981",
              weight: 4,
              opacity: 0.85,
            }).addTo(map);
            map.fitBounds(L.latLngBounds(roadCoords), { padding: [50, 50] });
          })
          .catch(() => {
            // Silencioso: queda la línea recta ya dibujada.
          });
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
              <span className="inline-block h-3 w-3 rounded-full bg-status-ok border border-white" /> Inicio
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-status-danger border border-white" /> Fin
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-4 rounded bg-status-ok" /> Ruta ({distanceKm.toFixed(1)} km)
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
            <span className="inline-block h-3 w-3 rounded-full bg-status-ok border border-white" /> Inicio
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-status-danger border border-white" /> Fin
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-status-ok" /> Ruta
            {distanceKm != null ? ` (${distanceKm.toFixed(1)} km)` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
