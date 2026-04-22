"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { portalFetch } from "@/lib/portal-cliente-fetch";

interface AuditMapMarcacion {
  id: string;
  checkpointId?: string | null;
  checkpointName: string;
  timestamp: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
  geoValidada?: boolean | null;
  distanceM?: number | null;
}

interface CheckpointStatus {
  id: string;
  name: string;
  lat: number;
  lng: number;
  orderIndex: number;
  status: "COMPLETED" | "PENDING";
  geoValidada: boolean | null;
  distanceM: number | null;
  timestamp: string | null;
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
  checkpointStatuses: CheckpointStatus[];
  routeSource: "marcaciones" | "walk_route" | "tracking" | "none";
  meta: {
    isAdHoc: boolean;
    trustScore: number;
  };
}

const SOURCE_LABEL: Record<AuditMapPayload["routeSource"], string> = {
  marcaciones: "Trazado real (posición en cada marcación)",
  walk_route: "Ruta guardada al cerrar la ronda",
  tracking: "Trazado GPS periódico (cada 30 s)",
  none: "Sin trazo disponible",
};

function buildPolylineCoords(data: AuditMapPayload): {
  coords: [number, number][] | null;
  source: AuditMapPayload["routeSource"];
} {
  const marks = [...data.marcaciones]
    .filter(
      (m) =>
        m.lat != null && m.lng != null && Number(m.lat) !== 0 && Number(m.lng) !== 0
    )
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (marks.length >= 2) {
    return {
      coords: marks.map((m) => [m.lat!, m.lng!]),
      source: "marcaciones",
    };
  }

  const w = data.walkRoute;
  if (w && w.length >= 2) {
    return { coords: w.map((p) => [p.lat, p.lng]), source: "walk_route" };
  }

  const t = data.trackingRoute;
  if (t.length >= 2) {
    return { coords: t.map((p) => [p.lat, p.lng]), source: "tracking" };
  }

  return { coords: null, source: "none" };
}

interface Props {
  ejecucionId: string;
  /** Altura del mapa. Default 320px. */
  height?: number;
}

/**
 * Mapa de ronda para el portal cliente: muestra checkpoints (marcados y no
 * marcados) + recorrido del guardia. Consume
 * `/api/portal/cliente/rondas/[id]/audit-map` que valida tenencia multi-tenant.
 *
 * Leaflet se carga dinámicamente para no romper SSR.
 */
export function RondaMapView({ ejecucionId, height = 320 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
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
        const res = await portalFetch(
          `/api/portal/cliente/rondas/${ejecucionId}/audit-map`
        );
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
  }, [ejecucionId]);

  useEffect(() => {
    if (!payload || !mapRef.current || loading) return;
    if (mapInstanceRef.current) {
      (mapInstanceRef.current as { remove: () => void }).remove();
      mapInstanceRef.current = null;
    }

    let disposed = false;

    (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css" as string);

      if (disposed || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 }
      ).addTo(map);

      const bounds: [number, number][] = [];

      const { coords } = buildPolylineCoords(payload);

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
          .bindTooltip("Inicio del recorrido", { permanent: false })
          .addTo(map);

        L.circleMarker(coords[coords.length - 1], {
          radius: 9,
          fillColor: "#ef4444",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        })
          .bindTooltip("Fin del recorrido", { permanent: false })
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

      const checkpointsToRender =
        payload.checkpointStatuses.length > 0
          ? payload.checkpointStatuses
          : (payload.routeSnapshot ?? []).map((cp) => ({
              id: cp.id,
              name: cp.name,
              lat: cp.lat,
              lng: cp.lng,
              orderIndex: cp.orderIndex,
              status:
                cp.status === "completed" || cp.status === "COMPLETED"
                  ? ("COMPLETED" as const)
                  : ("PENDING" as const),
              geoValidada: null as boolean | null,
              distanceM: null as number | null,
              timestamp: null as string | null,
            }));

      for (const cp of checkpointsToRender) {
        const isCompleted = cp.status === "COMPLETED";
        const geoOk = cp.geoValidada;

        let bgColor: string;
        let borderStyle: string;
        let icon: string;
        let tooltipExtra = "";

        if (!isCompleted) {
          bgColor = "#ef4444";
          borderStyle = "border:2px solid #fff;";
          icon = "✗";
        } else if (geoOk === true) {
          bgColor = "#22c55e";
          borderStyle = "border:2px solid #fff;";
          icon = "✓";
        } else if (geoOk === false) {
          bgColor = "#f59e0b";
          borderStyle = "border:2px dashed #fff;";
          icon = "✓";
          tooltipExtra = " · Fuera del radio GPS";
        } else {
          bgColor = "#22c55e";
          borderStyle = "border:2px solid #fff;";
          icon = "✓";
        }

        const distInfo =
          cp.distanceM != null ? ` · ${Math.round(cp.distanceM)}m del punto` : "";
        const timeInfo = cp.timestamp
          ? ` · ${new Date(cp.timestamp).toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "";

        const divIcon = L.divIcon({
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${bgColor};${borderStyle}display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">${icon}</div>`,
          className: "",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        L.marker([cp.lat, cp.lng], { icon: divIcon })
          .bindTooltip(
            `${cp.orderIndex}. ${cp.name} — ${
              isCompleted ? "Marcado" : "No marcado"
            }${distInfo}${timeInfo}${tooltipExtra}`,
            { permanent: false }
          )
          .addTo(map);

        bounds.push([cp.lat, cp.lng]);
      }

      // Fallback: marcaciones sueltas cuando no hay template de checkpoints.
      if (
        checkpointsToRender.length === 0 &&
        payload.marcaciones.length > 0
      ) {
        for (const m of payload.marcaciones) {
          if (m.lat == null || m.lng == null) continue;
          if (Number(m.lat) === 0 && Number(m.lng) === 0) continue;
          bounds.push([m.lat, m.lng]);
          const isCompleted = m.status === "COMPLETED";
          L.circleMarker([m.lat, m.lng], {
            radius: 7,
            fillColor: isCompleted ? "#22c55e" : "#ef4444",
            color: "#fff",
            weight: 2,
            fillOpacity: 1,
          })
            .bindTooltip(`${m.checkpointName} — ${m.status}`, { permanent: false })
            .addTo(map);
        }
      }

      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [32, 32], maxZoom: 18 });
      } else {
        map.setView([-33.45, -70.65], 12);
      }

      mapInstanceRef.current = map;
    })();

    return () => {
      disposed = true;
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, [payload, loading]);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400"
        style={{ height }}
      >
        <MapPin className="h-5 w-5 opacity-60" />
        <span>No se pudo cargar el mapa</span>
        <span className="text-[10px] text-zinc-600">{error}</span>
      </div>
    );
  }

  const hasAnyCoord =
    (payload?.checkpointStatuses.length ?? 0) > 0 ||
    (payload?.marcaciones.filter((m) => m.lat != null && m.lng != null).length ?? 0) > 0 ||
    (payload?.walkRoute?.length ?? 0) > 0 ||
    (payload?.trackingRoute?.length ?? 0) > 0;

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900"
        style={{ height }}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-900/80">
            <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
            <span className="text-xs text-zinc-400">Cargando recorrido…</span>
          </div>
        )}
        {!loading && !hasAnyCoord && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-900/90 text-zinc-500">
            <MapPin className="h-6 w-6 opacity-60" />
            <span className="text-xs">Sin datos de ubicación para esta ronda</span>
          </div>
        )}
        <div ref={mapRef} className="h-full w-full" />
      </div>

      {payload && hasAnyCoord && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
          <span className="text-teal-400/90">{SOURCE_LABEL[payload.routeSource]}</span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded bg-emerald-500" /> Trazo
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 border border-white" />
            Marcado
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500 border border-white" />
            Fuera GPS
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 border border-white" />
            No marcado
          </span>
        </div>
      )}
    </div>
  );
}
