"use client";

import { useEffect, useRef } from "react";
import { X, CheckCircle2, XCircle } from "lucide-react";
import type { ReporteRow } from "./RondasReportesTable";

interface RondaAuditMapModalProps {
  row: ReporteRow;
  onClose: () => void;
}

export function RondaAuditMapModal({ row, onClose }: RondaAuditMapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamic import Leaflet to avoid SSR issues
    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css" as string);

      const map = L.map(mapRef.current!, {
        zoomControl: true,
        attributionControl: false,
      });

      // Satellite tiles
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 },
      ).addTo(map);

      const bounds: L.LatLngExpression[] = [];

      // Draw walked route (green polyline)
      if (row.walkRoute && row.walkRoute.length > 1) {
        const walkCoords = row.walkRoute.map(
          (p) => [p.lat, p.lng] as L.LatLngExpression,
        );
        L.polyline(walkCoords, {
          color: "#10B981",
          weight: 4,
          opacity: 0.8,
        }).addTo(map);

        // Start marker
        L.circleMarker(walkCoords[0] as L.LatLngExpression, {
          radius: 8,
          fillColor: "#22c55e",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        })
          .bindTooltip("Inicio", { permanent: false })
          .addTo(map);

        // End marker
        L.circleMarker(
          walkCoords[walkCoords.length - 1] as L.LatLngExpression,
          {
            radius: 8,
            fillColor: "#ef4444",
            color: "#fff",
            weight: 2,
            fillOpacity: 1,
          },
        )
          .bindTooltip("Fin", { permanent: false })
          .addTo(map);

        bounds.push(...walkCoords);
      }

      // Draw checkpoint markers from routeSnapshot
      if (row.routeSnapshot && row.routeSnapshot.length > 0) {
        for (const cp of row.routeSnapshot) {
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
      }

      // Also add marcacion locations if no routeSnapshot
      if ((!row.routeSnapshot || row.routeSnapshot.length === 0) && row.marcaciones.length > 0) {
        for (const m of row.marcaciones) {
          if (m.lat && m.lng) {
            bounds.push([m.lat, m.lng]);
            const isCompleted = m.status === "COMPLETED";
            const color = isCompleted ? "#22c55e" : "#ef4444";
            L.circleMarker([m.lat, m.lng], {
              radius: 6,
              fillColor: color,
              color: "#fff",
              weight: 2,
              fillOpacity: 1,
            })
              .bindTooltip(m.checkpointName, { permanent: false })
              .addTo(map);
          }
        }
      }

      // Fit bounds
      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
      } else {
        map.setView([-33.45, -70.65], 12); // Default: Santiago
      }

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [row]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-4xl rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Mapa de Ronda — {row.installation}
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
              {row.trustScore}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Map */}
        <div ref={mapRef} className="h-[400px] w-full" />

        {/* Legend */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-4 rounded bg-emerald-500" /> Ruta
            caminada
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Checkpoint
            marcado
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-400" /> Checkpoint no marcado
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 border border-white" />{" "}
            Inicio
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-red-500 border border-white" />{" "}
            Fin
          </span>
        </div>
      </div>
    </div>
  );
}
