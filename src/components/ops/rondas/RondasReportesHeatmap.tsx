"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface Installation {
  id: string;
  name: string;
}

interface HeatmapPoint {
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

interface Props {
  installations: Installation[];
  dateFrom: string;
  dateTo: string;
  initialInstallationId?: string;
}

function coverageColor(pct: number): string {
  if (pct >= 90) return "#22c55e";
  if (pct >= 70) return "#eab308";
  if (pct > 0) return "#ef4444";
  return "#6b7280";
}

function coverageLabel(pct: number): string {
  if (pct >= 90) return "Alta";
  if (pct >= 70) return "Media";
  if (pct > 0) return "Baja";
  return "Sin datos";
}

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { google?: { maps?: unknown } };
    if (w.google?.maps) {
      resolve();
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&language=es&region=CL`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Error cargando Google Maps"));
    document.head.appendChild(script);
  });
}

export function RondasReportesHeatmap({ installations, dateFrom, dateTo, initialInstallationId }: Props) {
  const [installationId, setInstallationId] = useState(initialInstallationId ?? "");
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);
  const circlesRef = useRef<Array<{ setMap: (m: unknown) => void }>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoRef = useRef<any>(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapReady(true))
      .catch((e) => setMapError(e.message));
  }, []);

  const fetchData = useCallback(async (instId: string) => {
    if (!instId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ installationId: instId });
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/ops/rondas/reportes/heatmap?${params}`);
      const json = await res.json();
      if (json.success) setPoints(json.data);
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (installationId) void fetchData(installationId);
    else setPoints([]);
  }, [installationId, fetchData]);

  useEffect(() => {
    if (!mapReady || !containerRef.current || points.length === 0) return;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as unknown as {
      google?: {
        maps?: {
          Map: new (...a: any[]) => any;
          Marker: new (...a: any[]) => any;
          Circle: new (...a: any[]) => any;
          InfoWindow: new (...a: any[]) => any;
          LatLngBounds: new () => { extend: (p: unknown) => void; isEmpty?: () => boolean };
          SymbolPath: { CIRCLE: number };
        };
      };
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!w.google?.maps) return;
    const gmaps = w.google.maps;

    markersRef.current.forEach((m) => m.setMap(null));
    circlesRef.current.forEach((c) => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new gmaps.Map(containerRef.current, {
        zoom: 16,
        center: { lat: points[0].lat, lng: points[0].lng },
        mapTypeId: "roadmap",
        styles: [
          { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a3441" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
        ],
        disableDefaultUI: true,
        zoomControl: true,
      });
    }

    const map = mapInstanceRef.current;
    const bounds = new gmaps.LatLngBounds();

    if (!infoRef.current) {
      infoRef.current = new gmaps.InfoWindow({ content: "" });
    }

    for (const pt of points) {
      const pos = { lat: pt.lat, lng: pt.lng };
      bounds.extend(pos);
      const color = coverageColor(pt.coveragePercent);

      const circle = new gmaps.Circle({
        map,
        center: pos,
        radius: pt.radiusM,
        fillColor: color,
        fillOpacity: 0.2,
        strokeColor: color,
        strokeOpacity: 0.5,
        strokeWeight: 1,
      });
      circlesRef.current.push(circle);

      const marker = new gmaps.Marker({
        map,
        position: pos,
        title: pt.name,
        icon: {
          path: gmaps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
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
          <div style="color:#e2e8f0;background:#1a1f2e;padding:8px 12px;border-radius:8px;font-size:12px;min-width:180px">
            <p style="font-weight:600;margin-bottom:4px">${pt.name}</p>
            <p>Cobertura: <strong>${pt.coveragePercent}%</strong> (${pt.totalMarks}/${pt.totalRounds})</p>
            <p>Última marcación: ${lastStr}</p>
            <p style="margin-top:4px;color:${color};font-weight:600">${coverageLabel(pt.coveragePercent)}</p>
          </div>
        `);
        info.open(map, marker);
      });
    }

    (map as { fitBounds: (b: unknown) => void }).fitBounds(bounds);
  }, [mapReady, points]);

  const instOptions = installations.map((i) => ({ id: i.id, label: i.name }));

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <SearchableSelect
          value={installationId}
          options={instOptions}
          placeholder="Selecciona una instalación..."
          emptyText="Sin instalaciones"
          onChange={setInstallationId}
        />
      </div>

      {!installationId && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Selecciona una instalación para ver el mapa de cobertura
        </div>
      )}

      {installationId && loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {installationId && !loading && points.length === 0 && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          Sin checkpoints con coordenadas para esta instalación
        </div>
      )}

      {mapError && (
        <div className="py-8 text-center text-sm text-red-400">{mapError}</div>
      )}

      {installationId && points.length > 0 && (
        <>
          <Card>
            <CardContent className="p-0">
              <div ref={containerRef} className="w-full h-[500px] rounded-lg" />
            </CardContent>
          </Card>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="font-semibold">Leyenda:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500" /> ≥90%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-500" /> 70-89%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" /> &lt;70%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-zinc-500" /> Sin datos
            </span>
          </div>
        </>
      )}
    </div>
  );
}
