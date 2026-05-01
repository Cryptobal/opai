"use client";

import { useEffect, useRef, useState } from "react";
import { X, CheckCircle2, XCircle, ImageIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WalkPoint {
  lat: number;
  lng: number;
}

interface RouteSnapshotPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  orderIndex: number;
  status: string;
}

interface MarcacionItem {
  checkpointId: string | null;
  checkpointName: string | null;
  timestamp: string;
  fotoEvidenciaUrl: string | null;
  status: string;
}

interface RondaDetail {
  ejecucionId: string;
  templateName: string;
  installationName: string;
  completedAt: string | null;
  startedAt: string | null;
  durationMinutes: number | null;
  porcentajeCompletado: number;
  trustScore: number;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  status: string;
  isAdHoc: boolean;
  walkRoute: WalkPoint[] | null;
  routeSnapshot: RouteSnapshotPoint[] | null;
  marcaciones: MarcacionItem[];
}

interface Props {
  ejecucionId: string;
  session: { guardiaId: string; tenantId: string; installationId: string };
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("es-CL", { month: "short" });
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} · ${hh}:${mm}`;
  } catch {
    return "--";
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "--:--";
  }
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completada") {
    return (
      <span className="rounded-full bg-status-ok-soft px-2 py-0.5 text-xs font-medium text-status-ok-fg">
        Completada
      </span>
    );
  }
  if (status === "incompleta") {
    return (
      <span className="rounded-full bg-status-warn-soft px-2 py-0.5 text-xs font-medium text-status-warn-fg">
        Incompleta
      </span>
    );
  }
  if (status === "cerrada_auto") {
    return (
      <span className="rounded-full bg-gray-500/20 px-2 py-0.5 text-xs font-medium text-gray-400">
        Cerrada auto
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-700/50 px-2 py-0.5 text-xs font-medium text-gray-400">
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HistorialRondaModal({ ejecucionId, session, onClose }: Props) {
  const [detail, setDetail] = useState<RondaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Fetch detail
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetch(
      `/api/portal/rondas/historial/${ejecucionId}?guardiaId=${session.guardiaId}&tenantId=${session.tenantId}`,
    )
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error ?? `Error ${res.status}`);
          return;
        }
        const json = await res.json();
        if (json.success) {
          setDetail(json.data);
        } else {
          setError(json.error ?? "Error al cargar detalle");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Error de conexión");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ejecucionId, session.guardiaId, session.tenantId]);

  // Initialize Leaflet map once detail is loaded
  useEffect(() => {
    if (!detail || !mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css" as string);

      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
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
      if (detail.walkRoute && detail.walkRoute.length > 1) {
        const walkCoords = detail.walkRoute.map(
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
        L.circleMarker(walkCoords[walkCoords.length - 1] as L.LatLngExpression, {
          radius: 8,
          fillColor: "#ef4444",
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
        })
          .bindTooltip("Fin", { permanent: false })
          .addTo(map);

        bounds.push(...walkCoords);
      }

      // Draw checkpoint markers from routeSnapshot
      if (detail.routeSnapshot && detail.routeSnapshot.length > 0) {
        for (const cp of detail.routeSnapshot) {
          const isCompleted =
            cp.status === "completed" || cp.status === "COMPLETED";
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
      } else if (detail.marcaciones.length > 0) {
        // Fallback: use marcacion data if no routeSnapshot
        for (const m of detail.marcaciones) {
          // marcaciones don't have lat/lng in the detail response — skip map pins
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
  }, [detail]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={handleBackdropClick}
    >
      <div
        className="relative mx-auto my-4 w-full max-w-2xl rounded-2xl border border-white/10 bg-gray-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-5 w-40 animate-pulse rounded bg-gray-700" />
            ) : detail ? (
              <>
                <h3 className="truncate text-base font-semibold text-white">
                  {detail.templateName}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {detail.completedAt && (
                    <span className="text-xs text-gray-400">
                      {formatDateTime(detail.completedAt)}
                    </span>
                  )}
                  <StatusBadge status={detail.status} />
                </div>
              </>
            ) : (
              <h3 className="text-base font-semibold text-white">
                Detalle de ronda
              </h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-gray-400 transition-colors hover:bg-gray-700 active:bg-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <svg
              className="h-8 w-8 animate-spin text-status-info-fg"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="mt-3 text-sm text-gray-400">Cargando detalle...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-status-danger-fg">{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && detail && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-px bg-white/5">
              <div className="flex flex-col items-center py-3 bg-gray-900/80">
                <span className="text-xl font-bold text-status-info-fg">
                  {Math.round(detail.porcentajeCompletado)}%
                </span>
                <span className="mt-0.5 text-xs text-gray-500">Completado</span>
              </div>
              <div className="flex flex-col items-center py-3 bg-gray-900/80">
                <span
                  className={`text-xl font-bold ${
                    detail.trustScore >= 80
                      ? "text-status-ok-fg"
                      : detail.trustScore >= 50
                        ? "text-status-warn-fg"
                        : "text-status-danger-fg"
                  }`}
                >
                  {detail.trustScore}
                </span>
                <span className="mt-0.5 text-xs text-gray-500">Trust score</span>
              </div>
              <div className="flex flex-col items-center py-3 bg-gray-900/80">
                <span className="text-xl font-bold text-white">
                  {detail.checkpointsCompletados}/{detail.checkpointsTotal}
                </span>
                <span className="mt-0.5 text-xs text-gray-500">Checkpoints</span>
              </div>
            </div>

            {/* Duration */}
            {detail.durationMinutes != null && (
              <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-500">
                Duración:{" "}
                <span className="text-gray-300">
                  {detail.durationMinutes >= 60
                    ? `${Math.floor(detail.durationMinutes / 60)}h ${detail.durationMinutes % 60}m`
                    : `${detail.durationMinutes} min`}
                </span>
                {detail.installationName && (
                  <span className="ml-3">
                    Instalación:{" "}
                    <span className="text-gray-300">{detail.installationName}</span>
                  </span>
                )}
              </div>
            )}

            {/* Map */}
            <div className="border-b border-white/10">
              <div ref={mapRef} className="h-[260px] w-full" />
              {/* Map legend */}
              <div className="flex flex-wrap items-center gap-3 bg-gray-900/90 px-4 py-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-4 rounded bg-status-ok" />
                  Ruta caminada
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-status-ok-fg" />
                  Marcado
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-status-danger-fg" />
                  No marcado
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-full border border-white bg-status-ok" />
                  Inicio
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-full border border-white bg-status-danger" />
                  Fin
                </span>
              </div>
            </div>

            {/* Checkpoint list */}
            {detail.routeSnapshot && detail.routeSnapshot.length > 0 && (
              <div className="border-b border-white/10">
                <h4 className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Checkpoints
                </h4>
                <div className="divide-y divide-white/5">
                  {detail.routeSnapshot.map((cp) => {
                    const isCompleted =
                      cp.status === "completed" || cp.status === "COMPLETED";
                    // Find corresponding marcacion for photo
                    const marcacion = detail.marcaciones.find(
                      (m) => m.checkpointId === cp.id,
                    );
                    return (
                      <div
                        key={cp.id}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-status-ok-fg" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-status-danger-fg" />
                        )}
                        <span className="flex-1 text-sm text-gray-300">
                          <span className="mr-2 text-xs text-gray-600">
                            {cp.orderIndex}.
                          </span>
                          {cp.name}
                        </span>
                        {marcacion?.timestamp && (
                          <span className="text-xs text-gray-600">
                            {formatTimestamp(marcacion.timestamp)}
                          </span>
                        )}
                        {marcacion?.fotoEvidenciaUrl && (
                          <button
                            onClick={() =>
                              setExpandedPhoto(marcacion.fotoEvidenciaUrl!)
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-gray-800 transition-colors hover:border-status-info-border"
                          >
                            <img
                              src={marcacion.fotoEvidenciaUrl}
                              alt="Evidencia"
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display =
                                  "none";
                                (
                                  e.currentTarget
                                    .nextElementSibling as HTMLElement | null
                                )?.removeAttribute("style");
                              }}
                            />
                            <ImageIcon
                              className="h-4 w-4 text-gray-500"
                              style={{ display: "none" }}
                            />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Marcaciones list (fallback when no routeSnapshot) */}
            {(!detail.routeSnapshot || detail.routeSnapshot.length === 0) &&
              detail.marcaciones.length > 0 && (
                <div className="border-b border-white/10">
                  <h4 className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-gray-500">
                    Marcaciones
                  </h4>
                  <div className="divide-y divide-white/5">
                    {detail.marcaciones.map((m, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-status-ok-fg" />
                        <span className="flex-1 text-sm text-gray-300">
                          {m.checkpointName ?? "Checkpoint"}
                        </span>
                        <span className="text-xs text-gray-600">
                          {formatTimestamp(m.timestamp)}
                        </span>
                        {m.fotoEvidenciaUrl && (
                          <button
                            onClick={() => setExpandedPhoto(m.fotoEvidenciaUrl!)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-gray-800 transition-colors hover:border-status-info-border"
                          >
                            <img
                              src={m.fotoEvidenciaUrl}
                              alt="Evidencia"
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Empty state */}
            {(!detail.routeSnapshot || detail.routeSnapshot.length === 0) &&
              detail.marcaciones.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-600">
                  Sin datos de checkpoints para esta ronda.
                </div>
              )}
          </>
        )}
      </div>

      {/* Expanded photo overlay */}
      {expandedPhoto && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90"
          onClick={() => setExpandedPhoto(null)}
        >
          <img
            src={expandedPhoto}
            alt="Evidencia ampliada"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
          <button
            onClick={() => setExpandedPhoto(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
