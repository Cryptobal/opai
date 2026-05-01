"use client";

import { Fragment, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Camera, Mic, Clock, CheckCircle2, XCircle, AlertTriangle, ExternalLink, MapPin, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReporteRow {
  id: string;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  installation: string;
  installationId: string | null;
  template: string;
  /** Ronda libre (sin plantilla): Trust Score no aplica */
  isAdHoc?: boolean;
  guardiaId: string | null;
  guardia: string;
  guardiaCode: string;
  rut: string;
  status: string;
  checkpointsTotal: number;
  checkpointsCompletados: number;
  porcentajeCompletado: number;
  trustScore: number;
  trustBreakdown: TrustBreakdown | null;
  durationMinutes: number | null;
  notes?: string | null;
  walkRoute: Array<{ lat: number; lng: number }> | null;
  routeSnapshot: Array<{ id: string; name: string; lat: number; lng: number; orderIndex: number; status: string }> | null;
  marcaciones: MarcacionRow[];
  _count?: { incidentes: number };
  incidentes?: Array<{
    id: string;
    tipo: string;
    status: string;
    descripcion: string;
    createdAt: string;
  }>;
}

interface TrustBreakdown {
  completion?: { score: number; weight: number };
  time?: { score: number; weight: number };
  speed?: { score: number; weight: number };
  sequence?: { score: number; weight: number };
  punctuality?: { score: number; weight: number };
}

interface MarcacionRow {
  id: string;
  checkpointName: string;
  timestamp: string;
  status: string;
  hasPhoto: boolean;
  fotoEvidenciaUrl?: string | null;
  hasAudio: boolean;
  distanceM: number | null;
  lat?: number | null;
  lng?: number | null;
  googleMapsUrl?: string | null;
  geoValidada?: boolean | null;
  verificationMethod?: string | null;
}

interface ServerPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface Props {
  rows: ReporteRow[];
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onViewMap?: (row: ReporteRow) => void;
  onSendToCheckpoints?: (row: ReporteRow) => void;
  serverPagination?: ServerPagination;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  completada: { label: "Completada", cls: "bg-status-ok-soft text-status-ok-fg" },
  incompleta: { label: "Incompleta", cls: "bg-status-warn-soft text-status-warn-fg" },
  no_realizada: { label: "No realizada", cls: "bg-status-danger-soft text-status-danger-fg" },
  pendiente: { label: "Pendiente", cls: "bg-zinc-500/15 text-zinc-400" },
  en_curso: { label: "En curso", cls: "bg-status-info-soft text-status-info-fg" },
  cerrada_auto: { label: "Cerrada (auto)", cls: "bg-orange-500/15 text-status-warn-fg" },
  cerrada_admin: { label: "Cerrada (admin)", cls: "bg-violet-500/15 text-violet-400" },
};

function trustColor(score: number): string {
  if (score >= 85) return "text-status-ok-fg";
  if (score >= 70) return "text-status-info-fg";
  if (score >= 50) return "text-status-warn-fg";
  return "text-status-danger-fg";
}

function trustBg(score: number): string {
  if (score >= 85) return "bg-status-ok-soft border-status-ok-border";
  if (score >= 70) return "bg-status-info-soft border-blue-500/25";
  if (score >= 50) return "bg-status-warn-soft border-amber-500/25";
  return "bg-status-danger-soft border-red-500/25";
}

const SORT_COLS = [
  { key: "scheduledAt", label: "Fecha" },
  { key: "installation", label: "Instalación" },
  { key: "template", label: "Plantilla" },
  { key: "guardia", label: "Guardia" },
  { key: "status", label: "Estado" },
  { key: "porcentajeCompletado", label: "Cump. %" },
  { key: "trustScore", label: "Trust" },
  { key: "durationMinutes", label: "Duración" },
];

const BREAKDOWN_LABELS: Record<string, string> = {
  completion: "Completitud",
  time: "Tiempo",
  speed: "Velocidad",
  sequence: "Secuencia",
  punctuality: "Puntualidad",
};

const BREAKDOWN_COLORS: Record<string, string> = {
  completion: "bg-status-ok",
  time: "bg-status-info",
  speed: "bg-purple-500",
  sequence: "bg-status-warn",
  punctuality: "bg-status-info",
};

function TrustBreakdownBars({ breakdown }: { breakdown: TrustBreakdown }) {
  const entries = Object.entries(breakdown).filter(([k, v]) => {
    if (k === "adHoc" || k === "applicable" || k === "reason" || k === "closedBy" || k === "closedAt") return false;
    return v && typeof v === "object" && "score" in v;
  }) as [string, { score: number; weight: number }][];

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5 mt-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Trust Score Breakdown
      </p>
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-20 text-[11px] text-muted-foreground shrink-0">
            {BREAKDOWN_LABELS[key] ?? key} ({Math.round(val.weight * 100)}%)
          </span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", BREAKDOWN_COLORS[key] ?? "bg-primary")}
              style={{ width: `${Math.max(val.score, 2)}%` }}
            />
          </div>
          <span className="text-[11px] font-medium tabular-nums w-8 text-right">{val.score}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Overlap detection ----------------------------------------------------

/** Haversine distance in meters between two lat/lng coordinates. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns the pair of consecutive (or near-consecutive) marcaciones that look
 * like they were auto-marked by geofence without the guard moving between them.
 *
 * Criteria:
 *  - Both are COMPLETED
 *  - Time between them < 90 s
 *  - Guard position at marking < 10 m apart (or no position data for either)
 */
function detectOverlappingCheckpoints(marcaciones: MarcacionRow[]): Array<[MarcacionRow, MarcacionRow]> {
  const completed = marcaciones.filter((m) => m.status === "COMPLETED" && m.timestamp);
  const pairs: Array<[MarcacionRow, MarcacionRow]> = [];

  for (let i = 0; i < completed.length - 1; i++) {
    const a = completed[i];
    const b = completed[i + 1];
    const dtMs = Math.abs(new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (dtMs > 90_000) continue; // > 90 s → not suspicious

    const hasCoords = a.lat != null && a.lng != null && b.lat != null && b.lng != null;
    if (hasCoords) {
      const dist = haversineM(a.lat!, a.lng!, b.lat!, b.lng!);
      if (dist < 10) pairs.push([a, b]);
    } else {
      // No position data → suspicious by time alone
      pairs.push([a, b]);
    }
  }
  return pairs;
}

// ---- Human-readable close reasons -----------------------------------------

/** Human-readable explanations for technical close-reason codes. */
const CLOSE_REASON_TEXTS: Record<string, string> = {
  // Free rounds
  auto_closed_free_round:
    "El sistema detectó que la ronda libre estuvo inactiva durante 30 minutos consecutivos (sin marcaciones ni movimiento GPS), por lo que la cerró automáticamente para liberar la sesión del guardia.",

  // Scheduled rounds — next round triggered
  auto_closed_next_round_started:
    "El sistema cerró esta ronda programada automáticamente porque llegó la hora de la siguiente ronda de la misma programación. El guardia no la había finalizado manualmente.",

  // Scheduled rounds — frequency elapsed without a next round
  frequency_elapsed:
    "El sistema cerró la ronda porque transcurrió el tiempo de frecuencia configurado entre rondas consecutivas y el guardia no la finalizó manualmente.",

  // Scheduled rounds marked no_realizada
  auto_closed_not_performed:
    "La ronda fue marcada como No Realizada: el guardia no la inició dentro de la ventana de tolerancia permitida (aproximadamente la mitad del tiempo entre rondas). El sistema la cerró automáticamente.",

  // Exceeded maximum duration
  auto_closed_exceeded_max_duration:
    "La ronda superó la duración máxima configurada para esta instalación y fue cerrada automáticamente por el sistema.",

  // Generic scheduled-round auto close
  auto_closed_scheduled:
    "La ronda programada fue cerrada automáticamente por el sistema al vencer el tiempo de la ventana de ejecución.",

  // Admin / manual close
  closed_by_admin:
    "La ronda fue cerrada manualmente por un administrador desde el panel de control.",

  // Completed/incomplete by guard
  completed_by_guard:
    "El guardia finalizó la ronda correctamente desde la aplicación móvil.",
  completed_incomplete:
    "El guardia cerró la ronda desde la aplicación, pero no todos los checkpoints fueron marcados.",

  // Fallback for unrecognised ad-hoc tags
  ad_hoc: "",
  ronda_libre: "",
};

function closureDetailText(row: ReporteRow): string[] {
  const out: string[] = [];
  const tb = row.trustBreakdown as Record<string, unknown> | null | undefined;
  const closedBy = tb && typeof tb.closedBy === "string" ? tb.closedBy : null;
  const reason = tb && typeof tb.reason === "string" ? tb.reason : null;

  // Primary explanation from reason code (most specific)
  if (reason && CLOSE_REASON_TEXTS[reason] !== undefined) {
    if (CLOSE_REASON_TEXTS[reason]) out.push(CLOSE_REASON_TEXTS[reason]);
  } else {
    // Fallback based on status
    switch (row.status) {
      case "cerrada_auto":
        out.push(
          "El sistema cerró esta ronda automáticamente. Puede deberse a inactividad prolongada, inicio de una nueva ronda programada o superación del tiempo máximo de ejecución.",
        );
        break;
      case "cerrada_admin":
        out.push("La ronda fue cerrada manualmente por un administrador desde el panel de control.");
        break;
      case "no_realizada":
        out.push(
          "La ronda quedó sin realizarse: el guardia no la inició dentro de la ventana de tiempo permitida y el sistema la cerró automáticamente.",
        );
        break;
      case "completada":
        out.push("El guardia finalizó la ronda correctamente desde la aplicación móvil.");
        break;
      case "incompleta":
        out.push(
          "El guardia cerró la ronda desde la aplicación, pero no todos los checkpoints fueron marcados antes del cierre.",
        );
        break;
      default:
        break;
    }
  }

  // Secondary: who/how triggered the close
  if (closedBy === "system_cron") {
    out.push(
      "Origen del cierre: proceso automático del servidor (tarea programada). No requirió intervención manual.",
    );
  } else if (closedBy === "guardia") {
    out.push("El guardia confirmó el cierre de la ronda desde su dispositivo móvil.");
  } else if (closedBy === "admin") {
    out.push("Cerrada por intervención de un usuario administrador.");
  }

  // Timestamp
  if (row.completedAt) {
    out.push(
      `Fecha y hora de cierre: ${new Date(row.completedAt).toLocaleString("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
      })}.`,
    );
  }

  return [...new Set(out)];
}

function ExpandedRow({
  row,
  onViewMap,
  onSendToCheckpoints,
  overlappingPairs,
}: {
  row: ReporteRow;
  onViewMap?: (row: ReporteRow) => void;
  onSendToCheckpoints?: (row: ReporteRow) => void;
  overlappingPairs: Array<[MarcacionRow, MarcacionRow]>;
}) {
  const puntosConCoords = row.marcaciones.filter((m) => m.lat != null && m.lng != null);
  const canSendToCheckpoints =
    onSendToCheckpoints &&
    row.installationId &&
    puntosConCoords.length > 0;

  // Build a set of marcacion IDs that are part of an overlap pair
  const overlapIds = new Set(overlappingPairs.flatMap(([a, b]) => [a.id, b.id]));

  return (
    <tr>
      <td colSpan={11} className="px-4 py-3 bg-muted/20 border-b border-border/50">
        {/* Overlap warning banner */}
        {overlappingPairs.length > 0 && (
          <div className="mb-3 rounded-lg border border-orange-500/40 bg-orange-950/20 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warn-fg mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-status-warn-fg mb-1">
                Posible geocerca solapada — {overlappingPairs.length} par{overlappingPairs.length > 1 ? "es" : ""} marcado{overlappingPairs.length > 1 ? "s" : ""} casi simultáneamente
              </p>
              {overlappingPairs.map(([a, b], idx) => {
                const dtS = Math.round(
                  Math.abs(new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) / 1000,
                );
                const hasCoords = a.lat != null && a.lng != null && b.lat != null && b.lng != null;
                const distLabel = hasCoords
                  ? `${Math.round(haversineM(a.lat!, a.lng!, b.lat!, b.lng!))} m de distancia`
                  : "posición no disponible";
                return (
                  <p key={idx} className="text-[11px] text-orange-300/80 leading-snug">
                    &ldquo;{a.checkpointName}&rdquo; → &ldquo;{b.checkpointName}&rdquo; — {dtS} s entre marcaciones · {distLabel}
                  </p>
                );
              })}
              <p className="text-[10px] text-orange-400/60 mt-1">
                Revisa el radio de geocerca de estos checkpoints en Configuración → Checkpoints.
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Timeline de checkpoints
            </p>
            {row.marcaciones.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin marcaciones</p>
            ) : (
              <div className="space-y-1">
                {row.marcaciones.map((m, i) => {
                  const isCompleted = m.status === "COMPLETED";
                  const isMissed = m.status === "MISSED";
                  const isOverlap = overlapIds.has(m.id);
                  return (
                    <div key={m.id} className="space-y-0.5">
                      <div className={cn("flex items-center gap-2 text-xs", isOverlap && "bg-orange-950/30 rounded px-1 -mx-1")}>
                        <span className="text-muted-foreground w-5 text-right tabular-nums">{i + 1}</span>
                        {isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-status-ok-fg shrink-0" />
                        ) : isMissed ? (
                          <XCircle className="h-3.5 w-3.5 text-status-danger-fg shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-status-warn-fg shrink-0" />
                        )}
                        <span className="text-foreground">{m.checkpointName}</span>
                        <span className="text-muted-foreground">
                          {new Date(m.timestamp).toLocaleTimeString("es-CL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isOverlap && (
                          <span
                            className="shrink-0"
                            title="Marcado simultáneamente con otro checkpoint — posible geocerca solapada"
                          >
                            <AlertTriangle className="h-3 w-3 text-status-warn-fg" />
                          </span>
                        )}
                        {m.fotoEvidenciaUrl ? (
                          <a href={m.fotoEvidenciaUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                            <img src={m.fotoEvidenciaUrl} alt="Foto" className="h-6 w-6 rounded object-cover border border-status-info-border" />
                          </a>
                        ) : m.hasPhoto ? (
                          <Camera className="h-3 w-3 text-status-info-fg" />
                        ) : null}
                        {m.hasAudio && <Mic className="h-3 w-3 text-purple-400" />}
                        {m.distanceM != null && (
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round(m.distanceM)}m
                          </span>
                        )}
                        {m.googleMapsUrl && (
                          <a
                            href={m.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-status-info-fg hover:text-status-info-fg"
                          >
                            <MapPin className="h-2.5 w-2.5" />
                            Mapa
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Cierre de la ronda
              </p>
              {closureDetailText(row).map((line) => (
                <p key={line} className="text-[11px] text-foreground/90 leading-snug">
                  {line}
                </p>
              ))}
            </div>
            {!row.isAdHoc && row.trustBreakdown && (
              <TrustBreakdownBars breakdown={row.trustBreakdown} />
            )}
            {row.isAdHoc && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Trust Score no aplica a rondas libres.
              </p>
            )}
            {row.notes && (
              <div className="mt-3 rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-3 py-2">
                <p className="text-xs font-medium text-yellow-500/80 mb-0.5">Comentario del guardia:</p>
                <p className="text-sm text-zinc-300 italic">&ldquo;{row.notes}&rdquo;</p>
              </div>
            )}
            {row.startedAt && row.completedAt && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {new Date(row.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {new Date(row.completedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
            {(row.incidentes?.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-border/50 pt-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Incidentes reportados
                </p>
                <div className="space-y-1.5">
                  {row.incidentes!.map((inc) => (
                    <div key={inc.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md bg-muted/20">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-medium",
                        inc.status === "abierto" && "bg-status-danger-soft text-status-danger-fg",
                        inc.status === "resuelto" && "bg-status-ok-soft text-status-ok-fg",
                        inc.status === "en_proceso" && "bg-status-info-soft text-status-info-fg",
                        inc.status === "asignado" && "bg-purple-500/15 text-purple-400",
                        inc.status === "descartado" && "bg-zinc-500/15 text-zinc-400",
                      )}>
                        {inc.status}
                      </span>
                      <span className="text-xs text-foreground font-medium">{inc.tipo}</span>
                      <span className="text-xs text-muted-foreground flex-1 truncate">{inc.descripcion}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(inc.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}{" "}
                        {new Date(inc.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {onViewMap && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewMap(row);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-status-info-soft px-3 py-1.5 text-xs font-medium text-status-info-fg hover:bg-teal-500/25 transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Ver recorrido en mapa
                </button>
              )}
              {canSendToCheckpoints && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`¿Enviar los ${puntosConCoords.length} puntos de esta ronda como checkpoints de ${row.installation}?`)) {
                      onSendToCheckpoints(row);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-status-info-soft px-3 py-1.5 text-xs font-medium text-status-info-fg hover:bg-blue-500/25 transition-colors"
                >
                  <MapPinned className="h-3.5 w-3.5" />
                  Enviar a checkpoints
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function RondasReportesTable({
  rows,
  page,
  pageSize,
  onPageChange,
  sortKey,
  sortDir,
  onSort,
  onViewMap,
  onSendToCheckpoints,
  serverPagination,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortKey];
      const bVal = (b as unknown as Record<string, unknown>)[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  // When server pagination is active, rows are already paged — show them all
  const isServerPaged = !!serverPagination;
  const totalPages = isServerPaged
    ? serverPagination.totalPages
    : Math.max(1, Math.ceil(sorted.length / pageSize));
  const totalItems = isServerPaged ? serverPagination.totalCount : sorted.length;
  const paged = isServerPaged ? sorted : sorted.slice(page * pageSize, (page + 1) * pageSize);

  const headerCls =
    "px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border cursor-pointer hover:bg-muted/70 select-none transition-colors";
  const cellCls = "px-3 py-2 text-sm text-foreground border-b border-border/50";

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-8 bg-muted/50 border-b-2 border-border" />
              {SORT_COLS.map((col) => (
                <th key={col.key} className={headerCls} onClick={() => onSort(col.key)}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                    )}
                  </span>
                </th>
              ))}
              <th className={headerCls}>Evidencias</th>
              <th className={headerCls}>Incidentes</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm text-muted-foreground">
                  Sin resultados
                </td>
              </tr>
            ) : (
              paged.map((row) => {
                const isExpanded = expandedId === row.id;
                const st = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.pendiente;
                const photoCount = row.marcaciones.filter((m) => m.hasPhoto).length;
                const audioCount = row.marcaciones.filter((m) => m.hasAudio).length;
                const overlappingPairs = detectOverlappingCheckpoints(row.marcaciones);
                const hasOverlap = overlappingPairs.length > 0;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    >
                      <td className={cn(cellCls, "w-8 text-center")}>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                        )}
                      </td>
                      <td className={cellCls}>
                        <div>
                          {new Date(row.scheduledAt).toLocaleDateString("es-CL", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(row.scheduledAt).toLocaleTimeString("es-CL", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </td>
                      <td className={cn(cellCls, "max-w-[160px] truncate")}>{row.installation}</td>
                      <td className={cn(cellCls, "max-w-[140px] truncate")}>{row.template}</td>
                      <td className={cellCls}>{row.guardia || "—"}</td>
                      <td className={cellCls}>
                        <Badge className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                      </td>
                      <td className={cn(cellCls, "text-right tabular-nums")}>
                        {Math.round(row.porcentajeCompletado)}%
                      </td>
                      <td className={cn(cellCls, "text-center")}>
                        {row.isAdHoc ? (
                          <span className="text-[11px] text-muted-foreground tabular-nums">N/A</span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center w-8 h-8 rounded-full border text-xs font-bold",
                              trustBg(row.trustScore),
                              trustColor(row.trustScore),
                            )}
                          >
                            {row.trustScore}
                          </span>
                        )}
                      </td>
                      <td className={cn(cellCls, "text-right tabular-nums text-muted-foreground")}>
                        {row.durationMinutes != null ? `${row.durationMinutes} min` : "—"}
                      </td>
                      <td className={cellCls}>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-foreground tabular-nums">
                            {row.checkpointsCompletados}/{row.checkpointsTotal}
                          </span>
                          {photoCount > 0 && (
                            <span className="flex items-center gap-0.5 text-status-info-fg">
                              <Camera className="h-3 w-3" />
                              <span className="text-[10px]">{photoCount}</span>
                            </span>
                          )}
                          {audioCount > 0 && (
                            <span className="flex items-center gap-0.5 text-purple-400">
                              <Mic className="h-3 w-3" />
                              <span className="text-[10px]">{audioCount}</span>
                            </span>
                          )}
                          {hasOverlap && (
                            <span
                              title={`${overlappingPairs.length} par(es) de checkpoints marcados casi simultáneamente sin movimiento. Puede indicar geocercas solapadas — revisar configuración.`}
                              className="flex items-center gap-0.5 text-status-warn-fg cursor-help"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={cn(cellCls, "text-center")}>
                        {(row._count?.incidentes ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-status-warn-soft text-status-warn-fg">
                            <AlertTriangle className="h-3 w-3" />
                            {row._count!.incidentes}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && <ExpandedRow row={row} onViewMap={onViewMap} onSendToCheckpoints={onSendToCheckpoints} overlappingPairs={overlappingPairs} />}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>
            Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalItems)} de{" "}
            {totalItems}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 rounded bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

