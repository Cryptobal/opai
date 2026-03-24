"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Loader2,
  MapPin,
  Shield,
  Camera,
  X,
  Clock,
  UserCheck,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClienteSession } from "@/lib/portal-cliente-types";

/* ── Types ── */

interface MarcacionPortal {
  id: string;
  tipo: "entrada" | "salida";
  timestamp: string;
  guardiaName: string;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  gpsStatus: string | null;
  lat: number | null;
  lng: number | null;
  metodoId: string | null;
  fotoEvidenciaUrl: string | null;
}

interface Props {
  session: ClienteSession;
  selectedInstallation: string;
}

/* ── Helpers ── */

function groupByDate(marcaciones: MarcacionPortal[]): Map<string, MarcacionPortal[]> {
  const map = new Map<string, MarcacionPortal[]>();
  for (const m of marcaciones) {
    const date = new Date(m.timestamp).toLocaleDateString("es-CL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const list = map.get(date) ?? [];
    list.push(m);
    map.set(date, list);
  }
  return map;
}

function MetodoBadge({ metodoId }: { metodoId: string | null }) {
  if (!metodoId) return null;
  const map: Record<string, { label: string; cls: string }> = {
    face_id: { label: "Face ID", cls: "bg-purple-500/20 text-purple-300" },
    foto: { label: "Foto", cls: "bg-blue-500/20 text-blue-300" },
    pin_fallback: { label: "PIN", cls: "bg-amber-500/20 text-amber-300" },
    rut_pin: { label: "RUT+PIN", cls: "bg-amber-500/20 text-amber-300" },
    manual: { label: "Manual", cls: "bg-slate-500/20 text-slate-300" },
  };
  const m = map[metodoId] ?? { label: metodoId, cls: "bg-slate-500/20 text-slate-300" };
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", m.cls)}>
      <Shield className="h-2.5 w-2.5" />
      {m.label}
    </span>
  );
}

function GpsBadge({ gpsStatus, distancia }: { gpsStatus: string | null; distancia: number | null }) {
  if (gpsStatus === "dentro_rango") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
        <MapPin className="h-2.5 w-2.5" />
        GPS OK{distancia != null ? ` (${Math.round(distancia)}m)` : ""}
      </span>
    );
  }
  if (gpsStatus === "fuera_rango") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
        <MapPin className="h-2.5 w-2.5" />
        Fuera ({distancia != null ? `${Math.round(distancia)}m` : "?"})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
      <MapPin className="h-2.5 w-2.5" />
      Sin GPS
    </span>
  );
}

/* ── Photo viewer overlay ── */

function PhotoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
        <X className="h-6 w-6" />
      </button>
      <img src={url} alt="Foto de evidencia" className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain" />
    </div>
  );
}

/* ── Main Component ── */

export function PortalMarcaciones({ session, selectedInstallation }: Props) {
  const [marcaciones, setMarcaciones] = useState<MarcacionPortal[]>([]);
  const [installationName, setInstallationName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

  const installationId = selectedInstallation || session.installations[0]?.id;

  useEffect(() => {
    if (!installationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/portal/cliente/instalaciones/${installationId}/marcaciones?limit=50`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setMarcaciones(json.data.marcaciones);
          setInstallationName(json.data.installationName);
        } else {
          setError(json.error ?? "Error al cargar marcaciones");
        }
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [installationId]);

  const grouped = useMemo(() => groupByDate(marcaciones), [marcaciones]);

  if (!installationId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-500">
        <AlertTriangle className="h-8 w-8 opacity-40" />
        <p className="text-sm">No hay instalaciones asignadas</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando marcaciones...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-red-400">
        <AlertTriangle className="h-6 w-6" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      {expandedPhoto && (
        <PhotoViewer url={expandedPhoto} onClose={() => setExpandedPhoto(null)} />
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-teal-400" />
          <h2 className="text-base font-semibold text-white">Marcaciones</h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {installationName} · Últimas {marcaciones.length} marcaciones
        </p>
      </div>

      {/* Empty state */}
      {marcaciones.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
          <Clock className="h-10 w-10 opacity-40" />
          <p className="text-sm">Sin marcaciones recientes</p>
        </div>
      )}

      {/* Grouped by date */}
      {Array.from(grouped.entries()).map(([date, items]) => (
        <div key={date} className="space-y-2">
          <p className="text-xs font-medium text-slate-500 capitalize sticky top-0 bg-[#0f1419] py-1 z-10">
            {date}
          </p>

          {items.map((m) => {
            const isEntrada = m.tipo === "entrada";
            const time = new Date(m.timestamp).toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl border p-3 space-y-2",
                  isEntrada
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-red-500/20 bg-red-500/5"
                )}
              >
                {/* Row 1: badge + guard name + time */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                        isEntrada
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      )}
                    >
                      {isEntrada ? "Entrada" : "Salida"}
                    </span>
                    <span className="text-sm text-white truncate">
                      {m.guardiaName}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-mono shrink-0">
                    {time}
                  </span>
                </div>

                {/* Row 2: photo + metadata */}
                <div className="flex gap-3">
                  {/* Photo thumbnail */}
                  {m.fotoEvidenciaUrl && (
                    <button
                      onClick={() => setExpandedPhoto(m.fotoEvidenciaUrl!)}
                      className="group relative rounded-lg overflow-hidden border border-white/10 shrink-0"
                    >
                      <img
                        src={m.fotoEvidenciaUrl}
                        alt="Evidencia"
                        className="h-16 w-16 object-cover group-hover:opacity-80 transition-opacity"
                      />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                        <Camera className="h-4 w-4 text-white" />
                      </span>
                    </button>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <GpsBadge gpsStatus={m.gpsStatus} distancia={m.geoDistanciaM} />
                    <MetodoBadge metodoId={m.metodoId} />
                    {m.lat != null && m.lng != null && (
                      <a
                        href={`https://www.google.com/maps?q=${m.lat},${m.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline"
                      >
                        <MapPin className="h-2.5 w-2.5" />
                        Ver mapa
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
