"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CheckpointPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  status: "completed" | "active" | "pending";
}

interface GuardPosition {
  id: string;
  label: string;
  lat: number;
  lng: number;
  hasAlert: boolean;
}

interface RoutePoint {
  lat: number;
  lng: number;
}

export interface MonitoreoMapProps {
  checkpoints: CheckpointPoint[];
  guards: GuardPosition[];
  routes: RoutePoint[][];
  center?: { lat: number; lng: number } | null;
  /** When set, map will auto-fit all these points (checkpoints + guards + routes). */
  selectedGuardId?: string | null;
  onFullscreenToggle?: () => void;
  isFullscreen?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GLatLngBounds = { extend: (p: { lat: number; lng: number }) => void; isEmpty: () => boolean };
type GMapInstance = {
  panTo: (c: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: GLatLngBounds, padding?: number | Record<string, number>) => void;
  getZoom: () => number;
};
type GMarker = { setMap: (m: unknown) => void; addListener: (e: string, cb: () => void) => void };
type GCircle = { setMap: (m: unknown) => void };
type GPolyline = { setMap: (m: unknown) => void };
type GInfoWindow = { open: (m: unknown, a: unknown) => void; close: () => void };
type GMaps = {
  Map: new (...a: any[]) => GMapInstance;
  Marker: new (...a: any[]) => GMarker;
  Circle: new (...a: any[]) => GCircle;
  Polyline: new (...a: any[]) => GPolyline;
  InfoWindow: new (...a: any[]) => GInfoWindow;
  LatLngBounds: new () => GLatLngBounds;
  SymbolPath: { CIRCLE: number };
  ControlPosition: { TOP_RIGHT: number };
  event: { addListenerOnce: (m: any, e: string, cb: () => void) => void };
};
type GWindow = { google?: { maps?: GMaps } };
/* eslint-enable @typescript-eslint/no-explicit-any */

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  active: "#3b82f6",
  pending: "#6b7280",
};

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

export function MonitoreoMap({
  checkpoints,
  guards,
  routes,
  center,
  selectedGuardId,
  onFullscreenToggle,
  isFullscreen,
}: MonitoreoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMapInstance | null>(null);
  const markersRef = useRef<GMarker[]>([]);
  const circlesRef = useRef<GCircle[]>([]);
  const polylinesRef = useRef<GPolyline[]>([]);
  const hasAutoFitRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setReady(true))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    if (mapRef.current) return;

    const w = window as unknown as GWindow;
    if (!w.google?.maps) return;
    const gm = w.google.maps;

    const defaultCenter = center || { lat: -33.45, lng: -70.65 };
    mapRef.current = new gm.Map(containerRef.current, {
      center: defaultCenter,
      zoom: 15,
      mapTypeId: "roadmap",
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8a8a9a" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a3e" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0e1a" }] },
      ],
      disableDefaultUI: true,
      zoomControl: true,
      mapTypeControl: true,
      mapTypeControlOptions: { position: gm.ControlPosition.TOP_RIGHT },
    });
  }, [ready, center]);

  /** Fit the map to show all given points with comfortable padding. */
  const fitToPoints = useCallback((points: Array<{ lat: number; lng: number }>) => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const w = window as unknown as GWindow;
    if (!w.google?.maps) return;
    const gm = w.google.maps;

    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(17);
      return;
    }

    const bounds = new gm.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });

    // Cap max zoom after fitBounds settles
    gm.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 18) map.setZoom(18);
    });
  }, []);

  const updateMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const w = window as unknown as GWindow;
    if (!w.google?.maps) return;
    const gm = w.google.maps;

    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    polylinesRef.current.forEach((p) => p.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];
    polylinesRef.current = [];

    checkpoints.forEach((cp) => {
      const color = STATUS_COLORS[cp.status] ?? STATUS_COLORS["pending"];
      const marker = new gm.Marker({
        position: { lat: cp.lat, lng: cp.lng },
        map,
        title: cp.name,
        icon: {
          path: gm.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 0.9,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(marker);

      const circle = new gm.Circle({
        center: { lat: cp.lat, lng: cp.lng },
        radius: cp.radiusM,
        map,
        fillColor: color,
        fillOpacity: 0.08,
        strokeColor: color,
        strokeOpacity: 0.3,
        strokeWeight: 1,
      });
      circlesRef.current.push(circle);
    });

    guards.forEach((g) => {
      const marker = new gm.Marker({
        position: { lat: g.lat, lng: g.lng },
        map,
        title: g.label,
        icon: {
          path: gm.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: g.hasAlert ? "#ef4444" : "#22c55e",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
        zIndex: 100,
      });

      const infoWindow = new gm.InfoWindow({ content: `<div style="color:#000;font-size:12px;font-weight:600">${g.label}</div>` });
      marker.addListener("click", () => infoWindow.open(map, marker));
      markersRef.current.push(marker);
    });

    routes.forEach((route) => {
      if (route.length < 2) return;
      const polyline = new gm.Polyline({
        path: route.map((p) => ({ lat: p.lat, lng: p.lng })),
        map,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.6,
        strokeWeight: 3,
      });
      polylinesRef.current.push(polyline);
    });

    // Auto-fit bounds on first load when there are points to show
    if (!hasAutoFitRef.current && (checkpoints.length > 0 || guards.length > 0)) {
      hasAutoFitRef.current = true;
      const allPoints: Array<{ lat: number; lng: number }> = [
        ...checkpoints.map((cp) => ({ lat: cp.lat, lng: cp.lng })),
        ...guards.map((g) => ({ lat: g.lat, lng: g.lng })),
      ];
      fitToPoints(allPoints);
    }
  }, [checkpoints, guards, routes, fitToPoints]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  // When a guard is selected, fit their checkpoint area + position; when deselected, fit all
  useEffect(() => {
    if (!mapRef.current) return;

    if (selectedGuardId) {
      // Fit to selected guard position + their route points
      const guardPos = guards.find((g) => g.id === selectedGuardId);
      if (!guardPos) return;

      const points: Array<{ lat: number; lng: number }> = [{ lat: guardPos.lat, lng: guardPos.lng }];
      // Add nearby checkpoints (all checkpoints if single installation)
      checkpoints.forEach((cp) => points.push({ lat: cp.lat, lng: cp.lng }));

      fitToPoints(points);
    } else if (center) {
      // Fallback to center prop
      mapRef.current.panTo(center);
      mapRef.current.setZoom(15);
    } else {
      // No selection, fit all
      const allPoints: Array<{ lat: number; lng: number }> = [
        ...checkpoints.map((cp) => ({ lat: cp.lat, lng: cp.lng })),
        ...guards.map((g) => ({ lat: g.lat, lng: g.lng })),
      ];
      if (allPoints.length > 0) fitToPoints(allPoints);
    }
  }, [selectedGuardId, center, guards, checkpoints, fitToPoints]);

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card flex items-center justify-center h-full min-h-[400px]">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg border border-border bg-card overflow-hidden h-full min-h-[400px]">
      <div ref={containerRef} className="w-full h-full min-h-[400px]" />

      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          En vivo · 30s
        </span>
        {guards.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-background/80 backdrop-blur-sm px-2.5 py-1 text-[10px] text-foreground shadow">
            {guards.length} {guards.length === 1 ? "guardia" : "guardias"}
          </span>
        )}
      </div>

      {onFullscreenToggle && (
        <div className="absolute top-3 right-3">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0 bg-background/80 backdrop-blur-sm" onClick={onFullscreenToggle}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm px-3 py-1.5 text-[10px]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Completado</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Activo</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gray-500" /> Pendiente</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Alerta</span>
      </div>
    </div>
  );
}
