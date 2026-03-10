"use client";

import { useEffect, useRef, useState } from "react";

interface AlertGeofenceMapProps {
  checkpointLat: number;
  checkpointLng: number;
  checkpointRadius: number;
  guardiaLat: number;
  guardiaLng: number;
  guardiaAccuracy?: number | null;
  distancia?: number | null;
}

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { google?: { maps?: unknown } };
    if (w.google?.maps) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-maps-monitoreo");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"));
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-monitoreo";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&language=es&region=CL`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
}

export function AlertGeofenceMap({
  checkpointLat,
  checkpointLng,
  checkpointRadius,
  guardiaLat,
  guardiaLng,
  guardiaAccuracy,
  distancia,
}: AlertGeofenceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setReady(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const g = (window as any).google.maps;

    const map = new g.Map(mapRef.current, {
      center: {
        lat: (checkpointLat + guardiaLat) / 2,
        lng: (checkpointLng + guardiaLng) / 2,
      },
      zoom: 18,
      mapTypeId: "hybrid",
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "cooperative",
    });

    // Checkpoint pin (blue)
    new g.Marker({
      position: { lat: checkpointLat, lng: checkpointLng },
      map,
      title: "Checkpoint",
      icon: {
        path: g.SymbolPath.CIRCLE,
        fillColor: "#3B82F6",
        fillOpacity: 1,
        strokeColor: "#1D4ED8",
        strokeWeight: 2,
        scale: 7,
      },
    });

    // Geofence radius
    new g.Circle({
      map,
      center: { lat: checkpointLat, lng: checkpointLng },
      radius: checkpointRadius,
      fillColor: "#3B82F6",
      fillOpacity: 0.1,
      strokeColor: "#3B82F6",
      strokeOpacity: 0.5,
      strokeWeight: 1,
    });

    // Guard pin (red)
    new g.Marker({
      position: { lat: guardiaLat, lng: guardiaLng },
      map,
      title: "Guardia",
      icon: {
        path: g.SymbolPath.CIRCLE,
        fillColor: "#EF4444",
        fillOpacity: 1,
        strokeColor: "#B91C1C",
        strokeWeight: 2,
        scale: 7,
      },
    });

    // GPS accuracy circle (if available)
    if (guardiaAccuracy && guardiaAccuracy > 0) {
      new g.Circle({
        map,
        center: { lat: guardiaLat, lng: guardiaLng },
        radius: guardiaAccuracy,
        fillColor: "#EF4444",
        fillOpacity: 0.05,
        strokeColor: "#EF4444",
        strokeOpacity: 0.3,
        strokeWeight: 1,
      });
    }

    // Dashed line between points
    new g.Polyline({
      map,
      path: [
        { lat: checkpointLat, lng: checkpointLng },
        { lat: guardiaLat, lng: guardiaLng },
      ],
      strokeColor: "#F59E0B",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      icons: [
        {
          icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
          offset: "0",
          repeat: "12px",
        },
      ],
    });

    // Auto-fit bounds
    const bounds = new g.LatLngBounds();
    bounds.extend({ lat: checkpointLat, lng: checkpointLng });
    bounds.extend({ lat: guardiaLat, lng: guardiaLng });
    map.fitBounds(bounds, 50);
  }, [ready, checkpointLat, checkpointLng, checkpointRadius, guardiaLat, guardiaLng, guardiaAccuracy]);

  return (
    <div className="space-y-1.5">
      <div
        ref={mapRef}
        className="w-full h-48 rounded-lg overflow-hidden border border-[#1a1f2e]"
      />
      <div className="flex items-center gap-3 text-[10px] text-[#64748b]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Checkpoint ({checkpointRadius}m)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Guardia
          {distancia != null ? ` (${distancia}m)` : ""}
        </span>
        {guardiaAccuracy != null && guardiaAccuracy > 0 && (
          <span>GPS: {Math.round(guardiaAccuracy)}m</span>
        )}
      </div>
    </div>
  );
}
