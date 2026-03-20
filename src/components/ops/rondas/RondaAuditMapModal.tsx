"use client";

import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { ReporteRow } from "./RondasReportesTable";

interface AuditMapMarcacion {
  id: string;
  checkpointName: string;
  timestamp: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
}

interface AuditMapPayload {
  walkRoute: Array<{ lat: number; lng: number }> | null;
  trackingRoute: Array<{ lat: number; lng: number; createdAt?: string }>;
  routeSnapshot: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    orderIndex: number;
    status: string;
  }> | null;
  marcaciones: AuditMapMarcacion[];
  routeSource: "walk_route" | "tracking" | "marcaciones" | "none";
  meta: {
    isAdHoc: boolean;
    trustScore: number;
  };
}

interface RondaAuditMapModalProps {
  row: ReporteRow;
  onClose: () => void;
}

const SOURCE_LABEL: Record<AuditMapPayload["routeSource"], string> = {
  walk_route: "Ruta guardada al cerrar",
  tracking: "Trazado GPS en servidor ( puntos periódicos )",
  marcaciones: "Línea entre marcaciones (aprox.)",
  none: "Sin trazo — solo puntos sueltos",
};

function buildPolylineCoords(data: AuditMapPayload): {
  coords: [number, number][] | null;
  source: AuditMapPayload["routeSource"];
} {
  const w = data.walkRoute;
  if (w && w.length >= 2) {
    return { coords: w.map((p) => [p.lat, p.lng]), source: "walk_route" };
  }
  const t = data.trackingRoute;
  if (t.length >= 2) {
    return {
      coords: t.map((p) => [p.lat, p.lng]),
      source: "tracking",
    };
  }
  const marks = [...data.marcaciones]
    .filter((m) => m.lat != null && m.lng != null && Number(m.lat) !== 0 && Number(m.lng) !== 0)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (marks.length >= 2) {
    return {
      coords: marks.map((m) => [m.lat!, m.lng!]),
      source: "marcaciones",
    };
  }
  return { coords: null, source: "none" };
}

export function RondaAuditMapModal({ row, onClose }: RondaAuditMapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AuditMapPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);

    (async () => {
      try {
        const res = await fetch(`/api/ops/rondas/ejecucion/${row.id}/audit-map`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo cargar el mapa");
        }
        if (!cancelled) setPayload(json.data as AuditMapPayload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [row.id]);

  useEffect(() => {
    if (!payload || !mapRef.current || loading) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css" as string);

      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 },
      ).addTo(map);

      const bounds: [number, number][] = [];

      const { coords, source } = buildPolylineCoords(payload);

      if (coords && coords.length >= 2) {
        L.polyline(coords, {
          color: "#10B981",
          weight: 4,
          opacity: 0.85,
        }).addTo(map);

        L.circleMarker(coords[0], {
          radius: 9,
          fillColor: "#22c55e",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        })
          .bindTooltip(`Inicio${source === "tracking" ? " (GPS servidor)" : ""}`, { permanent: false })
          .addTo(map);

        L.circleMarker(coords[coords.length - 1], {
          radius: 9,
          fillColor: "#ef4444",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        })
          .bindTooltip(`Fin${source === "tracking" ? " (último GPS)" : ""}`, { permanent: false })
          .addTo(map);

        bounds.push(...coords);
      } else if (coords && coords.length === 1) {
        L.circleMarker(coords[0], {
          radius: 10,
          fillColor: "#22c55e",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        })
          .bindTooltip("Única posición registrada", { permanent: false })
          .addTo(map);
        bounds.push(coords[0]);
      }

      const snap = payload.routeSnapshot;
      if (snap && snap.length > 0) {
        const ordered = [...snap].sort((a, b) => a.orderIndex - b.orderIndex);
        for (const cp of ordered) {
          const isCompleted = cp.status === "completed" || cp.status === "COMPLETED";
          const color = isCompleted ? "#22c55e" : "#ef4444";
          const icon = isCompleted ? "✓" : "✗";

          const divIcon = L.divIcon({
            html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${icon}</div>`,
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          L.marker([cp.lat, cp.lng], { icon: divIcon })
            .bindTooltip(
              `${cp.orderIndex}. ${cp.name} — ${isCompleted ? "Marcado" : "No marcado"}`,
              { permanent: false },
            )
            .addTo(map);

          bounds.push([cp.lat, cp.lng]);
        }
      } else if (payload.marcaciones.length > 0) {
        for (const m of payload.marcaciones) {
          if (m.lat == null || m.lng == null) continue;
          if (Number(m.lat) === 0 && Number(m.lng) === 0) continue;
          bounds.push([m.lat, m.lng]);
          const isCompleted = m.status === "COMPLETED";
          const isMissed = m.status === "MISSED";
          const color = isMissed ? "#ef4444" : isCompleted ? "#22c55e" : "#eab308";
          L.circleMarker([m.lat, m.lng], {
            radius: 7,
            fillColor: color,
            color: "#fff",
            weight: 2,
            fillOpacity: 1,
          })
            .bindTooltip(`${m.checkpointName} — ${m.status}`, { permanent: false })
            .addTo(map);
        }
      }

      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48], maxZoom: 18 });
      } else {
        map.setView([-33.45, -70.65], 12);
      }

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [payload, loading]);

  const trustLabel =
    row.isAdHoc || payload?.meta.isAdHoc
      ? "N/A (ronda libre)"
      : String(payload?.meta.trustScore ?? row.trustScore);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-4xl rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Mapa de recorrido — {row.installation}
            </h3>
            <p className="text-xs text-muted-foreground">
              {row.guardia} &middot;{" "}
              {new Date(row.scheduledAt).toLocaleDateString("es-CL", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}{" "}
              {new Date(row.scheduledAt).toLocaleTimeString("es-CL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" · Trust: "}
              {trustLabel}
            </p>
            {payload && (
              <p className="text-[11px] text-teal-400/90 mt-0.5">
                Trazo: {SOURCE_LABEL[payload.routeSource]}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative h-[400px] w-full">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
              <span className="text-xs text-muted-foreground">Cargando recorrido y puntos…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background px-4 text-center text-sm text-red-400">
              {error}
            </div>
          )}
          <div ref={mapRef} className="h-full w-full" />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-emerald-500" /> Trazo del guardia
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Marcado / punto OK
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-400" /> No marcado
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 border border-white" /> Inicio del
            trazo
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-red-500 border border-white" /> Fin del trazo
          </span>
        </div>
      </div>
    </div>
  );
}
