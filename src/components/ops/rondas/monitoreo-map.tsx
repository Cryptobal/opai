"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer";

interface CheckpointPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  status: "completed" | "geo_pending" | "active" | "pending";
}

interface GuardPosition {
  id: string;
  label: string;
  lat: number;
  lng: number;
  hasAlert: boolean;
}

interface AlertMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tipo: string;
  severidad: string;
  installationName: string;
}

export interface InstallationMapData {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  guardiasPresentes?: number;
  guardiasRequeridos?: number;
  guardiaNames?: string[];
  activeRondaProgress?: string | null; // e.g. "6/8"
  activeRondaTrust?: number | null;
  activeRondaStatus?: string | null;
  alertCount?: number;
}

export interface TrackingPath {
  ejecucionId: string;
  points: Array<{ lat: number; lng: number }>;
}

export interface MonitoreoMapProps {
  checkpoints: CheckpointPoint[];
  guards: GuardPosition[];
  installations?: InstallationMapData[];
  alerts?: AlertMarker[];
  center?: { lat: number; lng: number } | null;
  selectedGuardId?: string | null;
  onFullscreenToggle?: () => void;
  isFullscreen?: boolean;
  onInstallationClick?: (installationId: string) => void;
  onInstallationDrillDown?: (installationId: string | null) => void;
  selectedInstallationId?: string | null;
  trackingPaths?: TrackingPath[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GLatLngBounds = { extend: (p: { lat: number; lng: number }) => void; isEmpty: () => boolean };
type GMapInstance = {
  panTo: (c: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: GLatLngBounds, padding?: number | Record<string, number>) => void;
  getZoom: () => number;
  addListener: (e: string, cb: () => void) => void;
};
type GMarker = { setMap: (m: unknown) => void; addListener: (e: string, cb: () => void) => void };
type GCircle = { setMap: (m: unknown) => void; setVisible: (v: boolean) => void };
type GInfoWindow = { open: (m: unknown, a: unknown) => void; close: () => void };
type GMaps = {
  Map: new (...a: any[]) => GMapInstance;
  Marker: new (...a: any[]) => GMarker;
  Circle: new (...a: any[]) => GCircle;
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
  geo_pending: "#f59e0b",
  active: "#3b82f6",
  pending: "#6b7280",
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildInstallationPopup(inst: InstallationMapData): string {
  const hasRonda = inst.activeRondaStatus === "en_curso";
  const statusColor = hasRonda ? "#22c55e" : inst.alertCount && inst.alertCount > 0 ? "#ef4444" : "#64748b";
  const statusIcon = hasRonda ? "●" : inst.alertCount && inst.alertCount > 0 ? "⚠" : "○";
  const statusLabel = hasRonda ? "En ronda" : inst.alertCount && inst.alertCount > 0 ? "Con alertas" : "Sin actividad";

  const trustScore = inst.activeRondaTrust;
  const trustColor = trustScore != null ? (trustScore >= 80 ? "#22c55e" : trustScore >= 60 ? "#eab308" : "#ef4444") : "#64748b";

  const guardsHtml = (inst.guardiaNames ?? []).length > 0
    ? (inst.guardiaNames ?? []).map((n) => `<div style="font-size:11px;color:#cbd5e1;padding:1px 0">👤 ${escapeHtml(n)}</div>`).join("")
    : '<div style="font-size:11px;color:#64748b;padding:1px 0">Sin guardias</div>';

  const progressHtml = inst.activeRondaProgress
    ? `<div style="margin-top:6px;font-size:11px;color:#94a3b8">Ronda: <strong style="color:#e2e8f0">${escapeHtml(inst.activeRondaProgress)}</strong>${trustScore != null ? ` · Trust <strong style="color:${trustColor}">${trustScore}</strong>` : ""}</div>`
    : "";

  const alertHtml = inst.alertCount && inst.alertCount > 0
    ? `<div style="margin-top:4px;font-size:11px;color:#f87171">⚠️ ${inst.alertCount} alerta${inst.alertCount > 1 ? "s" : ""} activa${inst.alertCount > 1 ? "s" : ""}</div>`
    : "";

  return `<div style="background:#1e293b;color:#e2e8f0;padding:10px 12px;border-radius:8px;min-width:180px;max-width:260px;font-family:system-ui,-apple-system,sans-serif">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="color:${statusColor};font-size:14px">${statusIcon}</span>
      <strong style="color:white;font-size:13px">${escapeHtml(inst.name)}</strong>
      <span style="color:#64748b;font-size:10px;margin-left:auto">${inst.guardiasPresentes ?? 0}/${inst.guardiasRequeridos ?? 1}</span>
    </div>
    <div style="font-size:10px;color:#64748b;margin-bottom:4px">${statusLabel}</div>
    ${guardsHtml}
    ${progressHtml}
    ${alertHtml}
  </div>`;
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

export function MonitoreoMap({
  checkpoints,
  guards,
  installations,
  alerts,
  center,
  selectedGuardId,
  onFullscreenToggle,
  isFullscreen,
  onInstallationClick,
  selectedInstallationId,
  trackingPaths,
}: MonitoreoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMapInstance | null>(null);
  const markersRef = useRef<GMarker[]>([]);
  const circlesRef = useRef<GCircle[]>([]);
  const installationMarkersRef = useRef<GMarker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const alertMarkersRef = useRef<(GMarker | GCircle)[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const hasAutoFitRef = useRef(false);
  const zoomListenerRef = useRef<google.maps.MapsEventListener | null>(null);
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
        { featureType: "road", elementType: "labels", stylers: [{ visibility: "on" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0e1a" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
        { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
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

    // Cleanup previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    installationMarkersRef.current.forEach((m) => m.setMap(null));
    alertMarkersRef.current.forEach((m) => m.setMap(null));
    polylinesRef.current.forEach((p) => p.setMap(null));
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }
    markersRef.current = [];
    circlesRef.current = [];
    installationMarkersRef.current = [];
    alertMarkersRef.current = [];
    polylinesRef.current = [];

    // Checkpoint markers + geofence circles
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
      // Only show geofences at street-level zoom
      const zoom = map.getZoom();
      circle.setVisible(zoom !== undefined && zoom > 15);
      circlesRef.current.push(circle);
    });

    // Zoom listener for geofence visibility
    if (zoomListenerRef.current) {
      google.maps.event.removeListener(zoomListenerRef.current);
    }
    zoomListenerRef.current = (map as any).addListener("zoom_changed", () => {
      const zoom = map.getZoom();
      circlesRef.current.forEach((c) => c.setVisible(zoom !== undefined && zoom > 15));
    });

    // Guard markers (never clustered — real-time positions)
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

    // Installation markers — clustered
    const instMarkers: google.maps.Marker[] = [];
    (installations ?? []).forEach((inst) => {
      if (inst.lat == null || inst.lng == null) return;
      const marker = new gm.Marker({
        position: { lat: inst.lat, lng: inst.lng },
        title: inst.name,
        icon: {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: "#06b6d4",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
          scale: 1.5,
          anchor: { x: 12, y: 22, equals: () => false } as any,
        },
        zIndex: 10,
      }) as unknown as google.maps.Marker;

      const infoWindow = new gm.InfoWindow({
        content: buildInstallationPopup(inst),
      });
      (marker as any).addListener("click", () => {
        infoWindow.open(map, marker);
        onInstallationClick?.(inst.id);

        // Drill down: zoom to installation and show checkpoints
        if (inst.lat != null && inst.lng != null) {
          map.panTo({ lat: inst.lat, lng: inst.lng });
          map.setZoom(18);
        }
      });

      instMarkers.push(marker);
      installationMarkersRef.current.push(marker as unknown as GMarker);
    });

    // Create clusterer for installation markers
    if (instMarkers.length > 0) {
      clustererRef.current = new MarkerClusterer({
        map: map as unknown as google.maps.Map,
        markers: instMarkers,
        algorithm: new SuperClusterAlgorithm({ radius: 80 }),
        renderer: {
          render: ({ count, position }) => {
            return new google.maps.Marker({
              position,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: "#14b8a6",
                fillOpacity: 0.3,
                strokeColor: "#14b8a6",
                strokeWeight: 2,
                scale: 20 + Math.min(count * 2, 20),
              },
              label: {
                text: `${count}`,
                color: "#5eead4",
                fontSize: "12px",
                fontWeight: "bold",
              },
              zIndex: 1,
            });
          },
        },
      });
    }

    // Alert markers — large red pulsing circles at installation locations (never clustered)
    (alerts ?? []).forEach((alert) => {
      const pulseCircle = new gm.Circle({
        center: { lat: alert.lat, lng: alert.lng },
        radius: 80,
        map,
        fillColor: "#ef4444",
        fillOpacity: 0.15,
        strokeColor: "#ef4444",
        strokeOpacity: 0.6,
        strokeWeight: 2,
      });
      alertMarkersRef.current.push(pulseCircle);

      const alertMarker = new gm.Marker({
        position: { lat: alert.lat, lng: alert.lng },
        map,
        title: `⚠️ ${alert.label}`,
        icon: {
          path: "M12 2L1 21h22L12 2z",
          fillColor: alert.severidad === "critical" ? "#ef4444" : alert.severidad === "high" ? "#f97316" : "#eab308",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
          scale: 1.3,
          anchor: { x: 12, y: 21, equals: () => false } as any,
        },
        zIndex: 200,
      });
      const infoContent = `<div style="color:#000;padding:4px 6px;max-width:250px">
        <p style="font-size:13px;font-weight:700;color:#dc2626;margin:0 0 4px">⚠️ ALERTA</p>
        <p style="font-size:12px;font-weight:600;margin:0 0 2px">${alert.installationName}</p>
        <p style="font-size:11px;margin:0;color:#666">${alert.label}</p>
      </div>`;
      const infoWindow = new gm.InfoWindow({ content: infoContent });
      alertMarker.addListener("click", () => infoWindow.open(map, alertMarker));
      alertMarkersRef.current.push(alertMarker);
    });

    // Tracking polylines — guard walking paths
    (trackingPaths ?? []).forEach((track) => {
      if (track.points.length < 2) return;
      const polyline = new google.maps.Polyline({
        path: track.points.map((p) => ({ lat: p.lat, lng: p.lng })),
        map: map as unknown as google.maps.Map,
        strokeColor: "#22c55e",
        strokeOpacity: 0.5,
        strokeWeight: 3,
        geodesic: true,
        icons: [{
          icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, strokeColor: "#22c55e" },
          offset: "100%",
        }],
      });
      polylinesRef.current.push(polyline);
    });

    // Auto-fit bounds on first load
    const instPoints = (installations ?? []).filter((i) => i.lat != null && i.lng != null).map((i) => ({ lat: i.lat!, lng: i.lng! }));
    if (!hasAutoFitRef.current && (checkpoints.length > 0 || guards.length > 0 || instPoints.length > 0)) {
      hasAutoFitRef.current = true;
      const allPoints: Array<{ lat: number; lng: number }> = [
        ...checkpoints.map((cp) => ({ lat: cp.lat, lng: cp.lng })),
        ...guards.map((g) => ({ lat: g.lat, lng: g.lng })),
        ...instPoints,
      ];
      fitToPoints(allPoints);
    }
  }, [checkpoints, guards, installations, alerts, trackingPaths, fitToPoints, onInstallationClick]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  // When a guard is selected, fit their checkpoint area + position; when deselected, fit all
  useEffect(() => {
    if (!mapRef.current) return;

    if (selectedGuardId) {
      const guardPos = guards.find((g) => g.id === selectedGuardId);
      if (!guardPos) return;

      const points: Array<{ lat: number; lng: number }> = [{ lat: guardPos.lat, lng: guardPos.lng }];
      checkpoints.forEach((cp) => points.push({ lat: cp.lat, lng: cp.lng }));

      fitToPoints(points);
    } else if (center) {
      mapRef.current.panTo(center);
      mapRef.current.setZoom(15);
    } else {
      const allPoints: Array<{ lat: number; lng: number }> = [
        ...checkpoints.map((cp) => ({ lat: cp.lat, lng: cp.lng })),
        ...guards.map((g) => ({ lat: g.lat, lng: g.lng })),
        ...(installations ?? []).filter((i) => i.lat != null && i.lng != null).map((i) => ({ lat: i.lat!, lng: i.lng! })),
      ];
      if (allPoints.length > 0) fitToPoints(allPoints);
    }
  }, [selectedGuardId, center, guards, checkpoints, installations, fitToPoints]);

  // When selectedInstallationId changes, zoom to that installation
  useEffect(() => {
    if (!mapRef.current || !selectedInstallationId) return;
    const inst = (installations ?? []).find((i) => i.id === selectedInstallationId);
    if (inst?.lat != null && inst?.lng != null) {
      mapRef.current.panTo({ lat: inst.lat, lng: inst.lng });
      mapRef.current.setZoom(18);
    }
  }, [selectedInstallationId, installations]);

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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-ok px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
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

      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-black/75 backdrop-blur-sm px-3 py-2 text-[11px] font-medium text-white shadow-lg max-w-[calc(100%-24px)]">
        <span className="flex items-center gap-1.5" title="Instalación">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-status-info-fg flex-shrink-0" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
          </svg>
          Instalación
        </span>
        <span className="flex items-center gap-1.5" title="Guardia activo">
          <span className="h-3 w-3 rounded-full bg-status-ok ring-2 ring-white/60 flex-shrink-0" /> Guardia
        </span>
        <span className="flex items-center gap-1.5" title="Alerta activa">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-status-danger-fg flex-shrink-0" fill="currentColor">
            <path d="M12 2L1 21h22L12 2z" />
          </svg>
          Alerta
        </span>
        <span className="flex items-center gap-1.5" title="Checkpoint marcado">
          <span className="h-2.5 w-2.5 rounded-full bg-status-ok ring-1 ring-white/30 flex-shrink-0" /> Marcado
        </span>
        <span className="flex items-center gap-1.5" title="Checkpoint pendiente">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-500 ring-1 ring-white/20 flex-shrink-0" /> Pendiente
        </span>
        <span className="flex items-center gap-1.5" title="Recorrido del guardia">
          <span className="inline-block h-0.5 w-5 bg-status-ok/80 flex-shrink-0" /> Recorrido
        </span>
      </div>
    </div>
  );
}
