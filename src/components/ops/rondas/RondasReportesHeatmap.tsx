"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Installation {
  id: string;
  name: string;
}

interface CoveragePoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  totalMarks: number;
  totalRounds: number;
  coveragePercent: number;
  lastMarkedAt: string | null;
}

interface TrackingPoint {
  lat: number;
  lng: number;
  weight: number;
}

interface TrackingResponse {
  points: TrackingPoint[];
  count: number;
  totalCount?: number;
  mode: "raw" | "sampled";
  sampleRate?: number;
}

interface Props {
  installations: Installation[];
  dateFrom: string;
  dateTo: string;
  initialInstallationId?: string;
}

type MapMode = "coverage" | "tracking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function coverageColor(pct: number): string {
  if (pct >= 90) return "#10B981"; // emerald-500
  if (pct >= 70) return "#F59E0B"; // amber-500
  if (pct >= 50) return "#F97316"; // orange-500
  if (pct > 0) return "#EF4444"; // red-500
  return "#6B7280"; // gray-500
}

function coverageSize(totalRounds: number): number {
  if (totalRounds >= 50) return 48;
  if (totalRounds >= 20) return 40;
  if (totalRounds >= 10) return 34;
  return 28;
}

const DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3441" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
];

// ---------------------------------------------------------------------------
// Google Maps loader (with visualization library)
// ---------------------------------------------------------------------------

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { google?: { maps?: { visualization?: unknown } } };
    if (w.google?.maps?.visualization) {
      resolve();
      return;
    }
    // If maps loaded without visualization, we need to reload
    if (w.google?.maps && !w.google.maps.visualization) {
      // Visualization not loaded yet — append script
      const vizScript = document.createElement("script");
      vizScript.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=visualization&language=es&region=CL`;
      vizScript.async = true;
      vizScript.onload = () => resolve();
      vizScript.onerror = () => reject(new Error("Error cargando Google Maps visualization"));
      document.head.appendChild(vizScript);
      return;
    }
    const existing = document.getElementById("google-maps-heatmap");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY no configurada"));
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-heatmap";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=visualization&language=es&region=CL`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Error cargando Google Maps"));
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RondasReportesHeatmap({
  installations,
  dateFrom,
  dateTo,
  initialInstallationId,
}: Props) {
  const [installationId, setInstallationId] = useState(initialInstallationId ?? "");
  const [mode, setMode] = useState<MapMode>("coverage");
  const [coveragePoints, setCoveragePoints] = useState<CoveragePoint[]>([]);
  const [trackingData, setTrackingData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CoveragePoint | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);
  const circlesRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heatmapLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoRef = useRef<any>(null);

  // Load Google Maps
  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapReady(true))
      .catch((e) => setMapError(e.message));
  }, []);

  // ------- Data fetching -------

  const fetchCoverage = useCallback(
    async (instId: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ installationId: instId, mode: "coverage" });
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
        const res = await fetch(`/api/ops/rondas/reportes/heatmap?${params}`);
        const json = await res.json();
        if (json.success) setCoveragePoints(json.data);
        else setCoveragePoints([]);
      } catch {
        setCoveragePoints([]);
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo],
  );

  const fetchTracking = useCallback(
    async (instId: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ mode: "tracking" });
        if (instId) params.set("installationId", instId);
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
        const res = await fetch(`/api/ops/rondas/reportes/heatmap?${params}`);
        const json = await res.json();
        if (json.success) setTrackingData(json);
        else setTrackingData(null);
      } catch {
        setTrackingData(null);
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo],
  );

  // Fetch on mode/installation change
  useEffect(() => {
    if (mode === "coverage") {
      if (installationId) void fetchCoverage(installationId);
      else setCoveragePoints([]);
    } else {
      void fetchTracking(installationId || null);
    }
  }, [mode, installationId, fetchCoverage, fetchTracking]);

  // ------- Map rendering helpers -------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getGmaps = (): any | null => {
    const w = window as unknown as { google?: { maps?: unknown } };
    return w.google?.maps ?? null;
  };

  const clearCoverageMarkers = () => {
    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];
    infoRef.current?.close?.();
  };

  const clearHeatmapLayer = () => {
    if (heatmapLayerRef.current) {
      heatmapLayerRef.current.setMap(null);
      heatmapLayerRef.current = null;
    }
  };

  const ensureMap = (center: { lat: number; lng: number }) => {
    const gmaps = getGmaps();
    if (!gmaps || !containerRef.current) return null;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new gmaps.Map(containerRef.current, {
        zoom: 16,
        center,
        mapTypeId: "roadmap",
        styles: DARK_MAP_STYLES,
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: true,
      });
    }
    return mapInstanceRef.current;
  };

  // ------- Render coverage mode -------

  useEffect(() => {
    if (!mapReady || mode !== "coverage" || coveragePoints.length === 0) return;

    const gmaps = getGmaps();
    if (!gmaps) return;

    const map = ensureMap({ lat: coveragePoints[0].lat, lng: coveragePoints[0].lng });
    if (!map) return;

    clearHeatmapLayer();
    clearCoverageMarkers();

    if (!infoRef.current) {
      infoRef.current = new gmaps.InfoWindow({ content: "" });
    }

    const bounds = new gmaps.LatLngBounds();

    for (const pt of coveragePoints) {
      const pos = { lat: pt.lat, lng: pt.lng };
      bounds.extend(pos);
      const color = coverageColor(pt.coveragePercent);
      const size = coverageSize(pt.totalRounds);

      // Circle around checkpoint
      const circle = new gmaps.Circle({
        map,
        center: pos,
        radius: pt.radiusM,
        fillColor: color,
        fillOpacity: 0.15,
        strokeColor: color,
        strokeOpacity: 0.4,
        strokeWeight: 1,
      });
      circlesRef.current.push(circle);

      // SVG marker with percentage
      const svgIcon = {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${color}" fill-opacity="0.7" stroke="${color}" stroke-width="2"/>
            <text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" fill="white" font-size="11" font-weight="600">${Math.round(pt.coveragePercent)}%</text>
          </svg>
        `)}`,
        scaledSize: new gmaps.Size(size, size),
        anchor: new gmaps.Point(size / 2, size / 2),
      };

      const marker = new gmaps.Marker({
        map,
        position: pos,
        title: pt.name,
        icon: svgIcon,
        zIndex: Math.round(100 - pt.coveragePercent),
      });
      markersRef.current.push(marker);

      const lastStr = pt.lastMarkedAt
        ? new Date(pt.lastMarkedAt).toLocaleDateString("es-CL", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Nunca";

      marker.addListener("click", () => {
        const info = infoRef.current;
        if (!info) return;
        info.setContent(`
          <div style="color:#e2e8f0;background:#1a1f2e;padding:10px 14px;border-radius:8px;font-size:12px;min-width:220px">
            <p style="font-weight:600;margin:0 0 6px;font-size:13px">${pt.name}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px">
              <span style="color:#94a3b8">Cobertura:</span>
              <span style="font-weight:600;color:${color}">${pt.coveragePercent}%</span>
              <span style="color:#94a3b8">Marcaciones:</span>
              <span>${pt.totalMarks} / ${pt.totalRounds}</span>
              <span style="color:#94a3b8">Última visita:</span>
              <span>${lastStr}</span>
            </div>
            ${
              pt.coveragePercent < 70
                ? '<p style="margin:8px 0 0;padding:6px;background:#451a1a;border-radius:4px;font-size:11px;color:#fca5a5">⚠️ Cobertura crítica — requiere atención</p>'
                : ""
            }
          </div>
        `);
        info.open(map, marker);
        setSelectedCheckpoint(pt);
      });
    }

    map.fitBounds(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mode, coveragePoints]);

  // ------- Render tracking heatmap -------

  useEffect(() => {
    if (!mapReady || mode !== "tracking" || !trackingData) return;

    const gmaps = getGmaps();
    if (!gmaps?.visualization) return;

    clearCoverageMarkers();
    setSelectedCheckpoint(null);

    if (trackingData.points.length === 0) {
      clearHeatmapLayer();
      return;
    }

    const firstPt = trackingData.points[0];
    const map = ensureMap({ lat: firstPt.lat, lng: firstPt.lng });
    if (!map) return;

    clearHeatmapLayer();

    const heatmapData = trackingData.points.map((p) => ({
      location: new gmaps.LatLng(p.lat, p.lng),
      weight: p.weight,
    }));

    heatmapLayerRef.current = new gmaps.visualization.HeatmapLayer({
      data: heatmapData,
      map,
      radius: 25,
      opacity: 0.7,
      gradient: [
        "rgba(0, 0, 0, 0)",
        "rgba(66, 133, 244, 0.2)",
        "rgba(0, 200, 150, 0.4)",
        "rgba(255, 255, 0, 0.6)",
        "rgba(255, 128, 0, 0.8)",
        "rgba(255, 0, 0, 1)",
      ],
    });

    // Fit bounds
    const bounds = new gmaps.LatLngBounds();
    const sample = trackingData.points.slice(0, 200);
    for (const p of sample) {
      bounds.extend(new gmaps.LatLng(p.lat, p.lng));
    }
    map.fitBounds(bounds, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mode, trackingData]);

  // ------- UI -------

  const instOptions = installations.map((i) => ({ id: i.id, label: i.name }));

  const hasData =
    mode === "coverage" ? coveragePoints.length > 0 : (trackingData?.points.length ?? 0) > 0;

  const showMap = (mode === "coverage" ? !!installationId : true) && hasData && !loading;
  const showEmpty = !loading && (mode === "coverage" ? !!installationId : true) && !hasData;

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <SearchableSelect
            value={installationId}
            options={instOptions}
            placeholder="Todas las instalaciones"
            emptyText="Sin instalaciones"
            onChange={setInstallationId}
          />
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-border">
          <button
            onClick={() => setMode("coverage")}
            className={cn(
              "px-4 py-1.5 text-sm transition-colors",
              mode === "coverage"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted",
            )}
          >
            Cobertura checkpoints
          </button>
          <button
            onClick={() => setMode("tracking")}
            className={cn(
              "px-4 py-1.5 text-sm transition-colors",
              mode === "tracking"
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted",
            )}
          >
            Heatmap GPS
          </button>
        </div>

        {/* Point count */}
        {mode === "tracking" && trackingData && trackingData.count > 0 && (
          <span className="text-xs text-muted-foreground">
            {trackingData.count.toLocaleString()} puntos GPS
            {trackingData.mode === "sampled" && (
              <span className="text-amber-500 ml-1">
                (muestreo 1:{trackingData.sampleRate} de{" "}
                {trackingData.totalCount?.toLocaleString()})
              </span>
            )}
          </span>
        )}
      </div>

      {/* Empty states */}
      {mode === "coverage" && !installationId && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Selecciona una instalación para ver el mapa de cobertura
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {showEmpty && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          {mode === "coverage"
            ? "Sin checkpoints con coordenadas para esta instalación"
            : "Sin datos de tracking GPS para este período. El tracking se activa automáticamente cuando los guardias ejecutan rondas desde el portal."}
        </div>
      )}

      {mapError && <div className="py-8 text-center text-sm text-red-400">{mapError}</div>}

      {/* Map + optional side panel */}
      {showMap && (
        <>
          <Card>
            <CardContent className="p-0 relative">
              <div ref={containerRef} className="w-full h-[500px] rounded-lg" />

              {/* Side panel for selected checkpoint */}
              {selectedCheckpoint && mode === "coverage" && (
                <div className="absolute right-0 top-0 bottom-0 w-72 bg-background/95 backdrop-blur border-l overflow-y-auto p-4 z-10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm truncate pr-2">
                      {selectedCheckpoint.name}
                    </h3>
                    <button
                      onClick={() => setSelectedCheckpoint(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Coverage bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Cobertura</span>
                      <span className="font-medium">
                        {selectedCheckpoint.coveragePercent}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${selectedCheckpoint.coveragePercent}%`,
                          backgroundColor: coverageColor(selectedCheckpoint.coveragePercent),
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-muted-foreground">Marcaciones</div>
                      <div className="font-semibold">{selectedCheckpoint.totalMarks}</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-muted-foreground">Rondas totales</div>
                      <div className="font-semibold">{selectedCheckpoint.totalRounds}</div>
                    </div>
                  </div>

                  {/* Last visit */}
                  <div className="text-xs text-muted-foreground">
                    <span>Última visita: </span>
                    <span className="text-foreground">
                      {selectedCheckpoint.lastMarkedAt
                        ? new Date(selectedCheckpoint.lastMarkedAt).toLocaleDateString(
                            "es-CL",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )
                        : "Sin datos"}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Heatmap controls */}
          {mode === "tracking" && heatmapLayerRef.current && (
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <label className="flex items-center gap-2">
                Radio
                <input
                  type="range"
                  min={10}
                  max={50}
                  defaultValue={25}
                  className="w-24 accent-primary"
                  onChange={(e) =>
                    heatmapLayerRef.current?.set("radius", parseInt(e.target.value))
                  }
                />
              </label>
              <label className="flex items-center gap-2">
                Opacidad
                <input
                  type="range"
                  min={20}
                  max={100}
                  defaultValue={70}
                  className="w-24 accent-primary"
                  onChange={(e) =>
                    heatmapLayerRef.current?.set("opacity", parseInt(e.target.value) / 100)
                  }
                />
              </label>
            </div>
          )}

          {/* Coverage legend */}
          {mode === "coverage" && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium">Leyenda:</span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-emerald-500" /> ≥90%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-amber-500" /> 70-89%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-orange-500" /> 50-69%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-red-500" /> &lt;50%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-gray-500" /> Sin datos
              </span>
              <span className="ml-2 border-l pl-2">Tamaño = volumen de rondas</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
