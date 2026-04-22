"use client";

import { useEffect, useState } from "react";
import {
  MapPin,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PreviewBadge } from "./PreviewBadge";
import { OpaiBadge } from "./OpaiBadge";
import { usePortalData } from "@/hooks/usePortalData";
import { portalFetch } from "@/lib/portal-cliente-fetch";
import { usePortalSession } from "@/contexts/portal-cliente-session-context";
import { RondaMapView } from "./RondaMapView";

interface Ejecucion {
  id: string;
  installationId: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  porcentajeCompletado: number;
  trustScore: number;
  durationMinutes: number | null;
  notes: string | null;
  guardia?: { persona: { firstName: string; lastName: string } } | null;
}

interface EjecucionDetail extends Ejecucion {
  marcaciones: Array<{
    id: string;
    checkpointId: string | null;
    timestamp: string;
    lat: number | null;
    lng: number | null;
    geoValidada: boolean;
    fotoEvidenciaUrl: string | null;
    note: string | null;
    status: string;
  }>;
  incidentes: Array<{
    id: string;
    tipo: string;
    descripcion: string;
    fotoUrl: string | null;
    status: string;
    createdAt: string;
  }>;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof Clock }
> = {
  pendiente: {
    label: "Pendiente",
    color: "bg-zinc-800 text-zinc-400",
    icon: Clock,
  },
  en_curso: {
    label: "En curso",
    color: "bg-yellow-500/20 text-yellow-400",
    icon: Clock,
  },
  completada: {
    label: "Completada",
    color: "bg-emerald-500/20 text-emerald-400",
    icon: CheckCircle2,
  },
  incompleta: {
    label: "Incompleta",
    color: "bg-amber-500/20 text-amber-400",
    icon: AlertTriangle,
  },
  fallida: {
    label: "Fallida",
    color: "bg-red-500/20 text-red-400",
    icon: XCircle,
  },
  no_realizada: {
    label: "No realizada",
    color: "bg-red-500/20 text-red-400",
    icon: XCircle,
  },
};

interface Props {
  selectedInstallation: string;
}

export function PortalRondas({ selectedInstallation }: Props) {
  const { session } = usePortalSession();
  const isProspect = !!session?.isProspect;

  const { data: rondasData, loading, isDemo } = usePortalData<Ejecucion[]>({
    endpoint: "/api/portal/cliente/rondas",
    demoKey: "rondas_list",
    params: selectedInstallation ? { installationId: selectedInstallation } : undefined,
  });
  const rondas: Ejecucion[] = rondasData ?? [];

  const [selected, setSelected] = useState<EjecucionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Clear detail when filter changes
  useEffect(() => {
    setSelected(null);
  }, [selectedInstallation]);

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    try {
      const res = await portalFetch(`/api/portal/cliente/rondas/${id}`);
      const json = await res.json();
      if (json.success) setSelected(json.data);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  /* ── Detail view ── */
  if (selected) {
    const cfg = STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.pendiente;
    const Icon = cfg.icon;
    return (
      <div className="max-w-lg mx-auto px-4 py-4 pb-24">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 mb-4"
        >
          ← Volver
        </button>

        {/* Summary card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
                cfg.color
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {cfg.label}
            </span>
            <span className="text-xs text-zinc-500">
              {new Date(selected.scheduledAt).toLocaleDateString("es-CL", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>

          {selected.guardia && (
            <p className="text-xs text-zinc-400 mb-3">
              Guardia:{" "}
              <span className="text-zinc-200">
                {selected.guardia.persona.firstName}{" "}
                {selected.guardia.persona.lastName}
              </span>
            </p>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-white">
                {selected.porcentajeCompletado}%
              </p>
              <p className="text-[10px] text-zinc-500">Completado</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {selected.trustScore}
              </p>
              <p className="text-[10px] text-zinc-500">Trust Score</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                {selected.durationMinutes ?? "--"}
              </p>
              <p className="text-[10px] text-zinc-500">Minutos</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
              <span>Checkpoints</span>
              <span>
                {selected.checkpointsCompletados}/{selected.checkpointsTotal}
              </span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${selected.porcentajeCompletado}%` }}
              />
            </div>
          </div>

          {selected.notes && (
            <p className="mt-3 text-xs text-zinc-400 border-t border-zinc-800 pt-3">
              {selected.notes}
            </p>
          )}
        </div>

        {/* Mapa del recorrido */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Recorrido y puntos
          </h3>
          <RondaMapView ejecucionId={selected.id} height={320} />
        </div>

        {/* Incidentes */}
        {selected.incidentes.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Incidentes ({selected.incidentes.length})
            </h3>
            <div className="space-y-2">
              {selected.incidentes.map((inc) => (
                <div
                  key={inc.id}
                  className="bg-zinc-900 border border-red-900/40 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-red-400">
                      {inc.tipo.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(inc.createdAt).toLocaleTimeString("es-CL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">{inc.descripcion}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checkpoints / marcaciones */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Checkpoints ({selected.marcaciones.length})
          </h3>
          {selected.marcaciones.length === 0 ? (
            <p className="text-xs text-zinc-600">Sin marcaciones registradas</p>
          ) : (
            <div className="space-y-1.5">
              {selected.marcaciones.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      m.geoValidada ? "bg-emerald-400" : "bg-amber-400"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300 truncate">
                      {m.note || "Sin nota"}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {m.geoValidada ? "GPS validado" : "GPS no validado"}
                    </p>
                  </div>
                  <span className="text-[10px] text-zinc-500 flex-shrink-0">
                    {new Date(m.timestamp).toLocaleTimeString("es-CL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-24">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-teal-400" />
          <h2 className="text-base font-semibold">Rondas en tiempo real</h2>
          {isDemo && <PreviewBadge />}
          <OpaiBadge variant="live" />
          <span className="text-xs text-zinc-500 ml-auto">{rondas.length} registros</span>
        </div>
        {isProspect ? (
          <p className="text-xs text-zinc-500 mt-1 ml-6">Monitoreo GPS con geofencing automático</p>
        ) : (
          <p className="text-xs text-zinc-500 mt-1 ml-6">Monitoreo GPS en vivo de tus instalaciones</p>
        )}
      </div>

      {rondas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MapPin className="h-8 w-8 text-zinc-700 mb-3" />
          <p className="text-sm font-medium text-zinc-400">No hay rondas registradas aún</p>
          <p className="text-xs text-zinc-600 mt-1">Las rondas se actualizan en tiempo real con verificación GPS.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rondas.map((r) => {
            const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pendiente;
            const Icon = cfg.icon;
            return (
              <button
                key={r.id}
                onClick={() => loadDetail(r.id)}
                disabled={loadingDetail}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 text-left hover:border-zinc-700 transition-colors active:bg-zinc-800 disabled:opacity-60"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full",
                      cfg.color
                    )}
                  >
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500">
                      {new Date(r.scheduledAt).toLocaleDateString("es-CL", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    {loadingDetail ? (
                      <Loader2 className="h-3.5 w-3.5 text-zinc-600 animate-spin" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                    )}
                  </div>
                </div>

                {r.guardia && (
                  <p className="text-[10px] text-zinc-500 mb-1.5">
                    {r.guardia.persona.firstName} {r.guardia.persona.lastName}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span>
                        {r.checkpointsCompletados}/{r.checkpointsTotal}{" "}
                        checkpoints
                      </span>
                      <span>{r.porcentajeCompletado}%</span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full"
                        style={{ width: `${r.porcentajeCompletado}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-white">
                      {r.trustScore}
                    </p>
                    <p className="text-[10px] text-zinc-600">trust</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
