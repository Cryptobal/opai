"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  FileText,
  ExternalLink,
  Ticket,
  CalendarClock,
  CheckCheck,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DrawerHallazgo = {
  id: string;
  severity: string;
  status: string;
  ticketCode: string | null;
  ticketId: string | null;
  description?: string;
  occurrenceCount?: number;
  firstDetectedAt?: string | null;
  lastDetectedAt?: string | null;
  ticketCreatedAt?: string | null;
};

export type DrawerCellMeta = {
  docId: string | null;
  fileName: string | null;
  fileUrl?: string | null;
  expiresAt?: string | null;
  digitalStatus: string | null;
  fisicaPresente: boolean | null;
  ultimaVerificacion: string | null;
  supervisorName: string | null;
  hallazgos?: DrawerHallazgo[];
};

export type Props = {
  open: boolean;
  onClose: () => void;
  docName: string;
  capa: string;
  installationName: string;
  guardiaName?: string | null;
  guardiaRut?: string | null;
  digitalStatus: string;
  obligatorioEnVisita: boolean;
  tipoDocId?: string | null;
  codigo?: string | null;
  guardiaDocType?: string | null;
  installationId: string;
  guardiaId?: string | null;
  cellMeta?: DrawerCellMeta | null;
};

type HallazgoTimelineTicket = {
  id: string;
  code: string | null;
  status: string | null;
} | null;

type Hallazgo = {
  id: string;
  ticketId: string | null;
  severity: string | null;
  status?: string | null;
  description?: string | null;
  ticket?: HallazgoTimelineTicket;
};

type Supervision = {
  id: string;
  checkInAt: string | null;
};

type Supervisor = {
  id: string;
  name: string | null;
};

type Verificacion = {
  id: string;
  presente: boolean;
  capa: string;
  createdAt: string;
  photoUrl?: string | null;
  notes?: string | null;
  supervisor: Supervisor | null;
  supervision: Supervision | null;
  hallazgo: Hallazgo | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIGITAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  vigente: { label: "Vigente", color: "text-status-ok-fg" },
  por_vencer: { label: "Por vencer", color: "text-status-warn-fg" },
  vencido: { label: "Vencido", color: "text-status-danger-fg" },
  sin_documento: { label: "Sin documento", color: "text-zinc-400" },
  no_aplica: { label: "No aplica", color: "text-zinc-500" },
};

const CAPA_LABELS: Record<string, string> = {
  global: "Global",
  instalacion: "Instalación",
  guardia: "Guardia",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
  high: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  major: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  medium: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  minor: "bg-status-info-soft text-status-info-fg border-status-info-border",
  low: "bg-status-info-soft text-status-info-fg border-status-info-border",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  major: "Mayor",
  medium: "Medio",
  minor: "Menor",
  low: "Bajo",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocVerificacionDrawer({
  open,
  onClose,
  docName,
  capa,
  installationName,
  guardiaName,
  guardiaRut,
  digitalStatus,
  obligatorioEnVisita,
  tipoDocId,
  codigo,
  guardiaDocType,
  installationId,
  guardiaId,
  cellMeta,
}: Props) {
  const [verificaciones, setVerificaciones] = useState<Verificacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    setVerificaciones([]);
    setResolvedIds(new Set());

    const params = new URLSearchParams({ installationId, capa, limit: "20" });
    if (tipoDocId) params.set("tipoDocId", tipoDocId);
    if (codigo) params.set("codigo", codigo);
    if (guardiaDocType) params.set("guardiaDocType", guardiaDocType);
    if (guardiaId) params.set("guardiaId", guardiaId);

    fetch(`/api/operacional/verificaciones-fisicas?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setVerificaciones(res.data ?? []);
        } else {
          setError(res.error ?? "Error al cargar verificaciones");
        }
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [open, installationId, capa, tipoDocId, codigo, guardiaDocType, guardiaId]);

  async function handleResolve(h: DrawerHallazgo) {
    if (resolvingId) return;
    const confirmed = window.confirm(
      "¿Marcar este hallazgo como resuelto manualmente? El ticket asociado también se cerrará.",
    );
    if (!confirmed) return;

    setResolvingId(h.id);
    try {
      const res = await fetch(`/api/ops/supervision/findings/${h.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Resuelto manualmente desde la grilla operativa." }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setResolvedIds((prev) => {
        const next = new Set(prev);
        next.add(h.id);
        return next;
      });
    } catch (err) {
      alert(
        `No se pudo resolver el hallazgo: ${err instanceof Error ? err.message : "error desconocido"}`,
      );
    } finally {
      setResolvingId(null);
    }
  }

  const digitalMeta = DIGITAL_STATUS_LABELS[digitalStatus] ?? {
    label: digitalStatus,
    color: "text-zinc-400",
  };

  // Estado físico: priorizar verif recién cargadas (timeline), si no, caer a cellMeta
  const lastVerif = verificaciones[0] ?? null;
  const fisicaPresenteFromMeta = cellMeta?.fisicaPresente ?? null;
  const fisicaPresente = lastVerif !== null ? lastVerif.presente : fisicaPresenteFromMeta;

  const fisicoLabel =
    fisicaPresente === null ? "Sin verificar" : fisicaPresente ? "Presente" : "Ausente";
  const fisicoColor =
    fisicaPresente === null
      ? "text-zinc-400"
      : fisicaPresente
        ? "text-status-ok-fg"
        : "text-status-danger-fg";

  const ultimaVerifIso = lastVerif?.createdAt ?? cellMeta?.ultimaVerificacion ?? null;
  const supervisorName = lastVerif?.supervisor?.name ?? cellMeta?.supervisorName ?? null;

  // Hallazgos abiertos (pasados por la celda si existen).
  // Filtramos los que el usuario resolvió manualmente en esta sesión.
  const hallazgosAbiertos = (cellMeta?.hallazgos ?? []).filter(
    (h) =>
      (h.status === "open" || h.status === "in_progress") && !resolvedIds.has(h.id),
  );

  // Inconsistencia detectable: hay hallazgo abierto pero la última verificación física es "Presente".
  const hasInconsistency = hallazgosAbiertos.length > 0 && fisicaPresente === true;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-zinc-900 border-zinc-800 text-zinc-100 flex flex-col p-0 gap-0 overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-zinc-800 space-y-3">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold text-zinc-100 truncate">
                {docName}
              </SheetTitle>
              <p className="text-xs text-zinc-400 mt-0.5">{installationName}</p>
              {guardiaName && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  {guardiaName}
                  {guardiaRut && <span className="ml-1 text-zinc-600">· {guardiaRut}</span>}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
              {CAPA_LABELS[capa] ?? capa}
            </span>
            {obligatorioEnVisita && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-warn-soft text-status-warn-fg border border-status-warn-border">
                <AlertTriangle className="h-3 w-3" />
                Obligatorio en visita
              </span>
            )}
            {hallazgosAbiertos.length > 0 && (() => {
              // Si hay un único hallazgo canónico con múltiples ocurrencias, mostrar "N visitas"
              const single = hallazgosAbiertos.length === 1 ? hallazgosAbiertos[0] : null;
              const totalOcc = hallazgosAbiertos.reduce(
                (acc, h) => acc + (h.occurrenceCount ?? 1),
                0,
              );
              const label = single && (single.occurrenceCount ?? 1) > 1
                ? `Hallazgo abierto — ${single.occurrenceCount} visitas`
                : hallazgosAbiertos.length === 1
                  ? `1 hallazgo abierto`
                  : `${hallazgosAbiertos.length} hallazgos abiertos (${totalOcc} visitas)`;
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-danger-soft text-status-danger-fg border border-status-danger-border">
                  <AlertTriangle className="h-3 w-3" />
                  {label}
                </span>
              );
            })()}
          </div>
        </SheetHeader>

        {/* Status cards */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-zinc-800">
          <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Digital</p>
            <p className={`text-sm font-semibold ${digitalMeta.color}`}>{digitalMeta.label}</p>
            {cellMeta?.fileName && (
              <p className="mt-1 text-[11px] text-zinc-400 truncate flex items-center gap-1">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{cellMeta.fileName}</span>
              </p>
            )}
            {cellMeta?.expiresAt && (
              <p className="mt-0.5 text-[11px] text-zinc-500 flex items-center gap-1">
                <CalendarClock className="h-3 w-3 shrink-0" />
                Vence: {formatDate(cellMeta.expiresAt)}
              </p>
            )}
          </div>

          <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Físico</p>
            <p className={`text-sm font-semibold ${fisicoColor}`}>{fisicoLabel}</p>
            {ultimaVerifIso && (
              <p className="mt-1 text-[11px] text-zinc-400 flex items-center gap-1">
                <CalendarClock className="h-3 w-3 shrink-0" />
                {formatDate(ultimaVerifIso)}
                {supervisorName && <span className="text-zinc-500">· {supervisorName}</span>}
              </p>
            )}
          </div>
        </div>

        {/* Quick actions */}
        {capa !== "guardia" && (
          <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-zinc-800">
            <a
              href={`/crm/installations/${installationId}?tab=docs`}
              className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Ver ficha de instalación
            </a>
            {cellMeta?.fileUrl && (
              <a
                href={cellMeta.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                <FileText className="h-3 w-3" />
                Ver PDF
              </a>
            )}
          </div>
        )}

        {/* Aviso de inconsistencia */}
        {hasInconsistency && (
          <div className="px-5 py-3 border-b border-zinc-800 bg-status-warn-soft">
            <div className="flex items-start gap-2 rounded-lg border border-status-warn-border bg-status-warn-soft px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-status-warn-fg shrink-0 mt-0.5" />
              <div className="text-[11px] text-status-warn-fg leading-snug">
                <p className="font-semibold">Posible inconsistencia detectada</p>
                <p className="opacity-90 mt-0.5">
                  La última verificación física marca <span className="font-semibold">Presente</span>,
                  pero existe un hallazgo abierto. Probablemente ya se resolvió en terreno:
                  usa <span className="font-semibold">&ldquo;Marcar resuelto&rdquo;</span> debajo para cerrar el ticket.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Hallazgos abiertos */}
        {hallazgosAbiertos.length > 0 && (
          <div className="px-5 py-4 border-b border-zinc-800">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-status-danger-fg" />
              Hallazgos abiertos
            </p>
            <div className="space-y-2">
              {hallazgosAbiertos.map((h) => {
                const openedAt = h.ticketCreatedAt ?? h.firstDetectedAt ?? null;
                const daysOpen = openedAt
                  ? Math.max(
                      0,
                      Math.floor(
                        (Date.now() - new Date(openedAt).getTime()) /
                          (1000 * 60 * 60 * 24),
                      ),
                    )
                  : null;
                const occurrences = h.occurrenceCount ?? 1;
                const fmt = (iso?: string | null) =>
                  iso
                    ? new Date(iso).toLocaleDateString("es-CL", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—";
                return (
                  <div
                    key={h.id}
                    className={`rounded-lg border px-3 py-2 ${
                      SEVERITY_COLORS[h.severity] ??
                      "bg-zinc-800/50 text-zinc-300 border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase">
                        {SEVERITY_LABELS[h.severity] ?? h.severity}
                      </span>
                      {h.ticketCode && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-300">
                          <Ticket className="h-3 w-3" />
                          #{h.ticketCode}
                        </span>
                      )}
                    </div>
                    {h.description && (
                      <p className="mt-1 text-[11px] opacity-90 leading-snug">{h.description}</p>
                    )}

                    {/* Meta: días abierto, ocurrencias, fechas */}
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] opacity-90">
                      {daysOpen !== null && (
                        <div>
                          <span className="uppercase tracking-wider opacity-70">Abierto hace</span>
                          <div className="font-semibold">
                            {daysOpen} {daysOpen === 1 ? "día" : "días"}
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="uppercase tracking-wider opacity-70">Ocurrencias</span>
                        <div className="font-semibold">
                          {occurrences} {occurrences === 1 ? "visita" : "visitas"}
                        </div>
                      </div>
                      {h.firstDetectedAt && (
                        <div>
                          <span className="uppercase tracking-wider opacity-70">1ª detección</span>
                          <div>{fmt(h.firstDetectedAt)}</div>
                        </div>
                      )}
                      {h.lastDetectedAt && (
                        <div>
                          <span className="uppercase tracking-wider opacity-70">Última detección</span>
                          <div>{fmt(h.lastDetectedAt)}</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {h.ticketId && (
                        <a
                          href={`/ops/tickets/${h.ticketId}`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-status-info-fg hover:text-status-info-fg underline underline-offset-2"
                        >
                          Ver ticket
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleResolve(h)}
                        disabled={resolvingId === h.id}
                        className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-2 py-1 bg-status-ok-soft text-status-ok-fg border border-status-ok-border hover:bg-status-ok-soft disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      >
                        {resolvingId === h.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Resolviendo…
                          </>
                        ) : (
                          <>
                            <CheckCheck className="h-3 w-3" />
                            Marcar resuelto
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">
            Historial de verificaciones
          </p>

          {loading && (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-status-danger-soft border border-status-danger-border">
              <XCircle className="h-4 w-4 text-status-danger-fg shrink-0" />
              <p className="text-sm text-status-danger-fg">{error}</p>
            </div>
          )}

          {!loading && !error && verificaciones.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <X className="h-8 w-8 text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-500">Sin verificaciones registradas</p>
              {obligatorioEnVisita && (
                <p className="text-[11px] text-zinc-600 mt-1 max-w-[260px]">
                  Los supervisores deben verificar este documento en su próxima visita.
                </p>
              )}
            </div>
          )}

          {!loading && !error && verificaciones.length > 0 && (
            <ol className="relative border-l border-zinc-800 space-y-0 ml-2">
              {verificaciones.map((v) => (
                <li key={v.id} className="ml-4 pb-6 last:pb-0">
                  <span className="absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full ring-2 ring-zinc-900">
                    {v.presente ? (
                      <CheckCircle2 className="h-4 w-4 text-status-ok-fg bg-zinc-900 rounded-full" />
                    ) : (
                      <XCircle className="h-4 w-4 text-status-danger-fg bg-zinc-900 rounded-full" />
                    )}
                  </span>

                  <div className="ml-1">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-zinc-300">
                        {v.supervisor?.name ?? "Supervisor desconocido"}
                      </span>
                      <span className="text-[11px] text-zinc-500 shrink-0">
                        {formatDateTime(v.createdAt)}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        v.presente
                          ? "bg-status-ok-soft text-status-ok-fg border border-status-ok-border"
                          : "bg-status-danger-soft text-status-danger-fg border border-status-danger-border"
                      }`}
                    >
                      {v.presente ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {v.presente ? "Presente" : "Ausente"}
                    </span>

                    {v.hallazgo && (
                      <span
                        className={`ml-2 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          SEVERITY_COLORS[v.hallazgo.severity ?? ""] ??
                          "bg-zinc-700/50 text-zinc-400 border-zinc-600"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Hallazgo
                        {v.hallazgo.ticket?.code && (
                          <span className="opacity-70">#{v.hallazgo.ticket.code}</span>
                        )}
                      </span>
                    )}

                    {v.supervision && (
                      <div className="mt-1.5">
                        <a
                          href={`/ops/supervision/${v.supervision.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-status-info-fg hover:text-status-info-fg underline underline-offset-2 transition-colors"
                        >
                          Ver visita
                          {v.supervision.checkInAt && (
                            <span className="text-zinc-500 no-underline ml-1">
                              · {formatDateTime(v.supervision.checkInAt)}
                            </span>
                          )}
                        </a>
                      </div>
                    )}

                    {v.photoUrl && (
                      <div className="mt-2">
                        <a
                          href={v.photoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group inline-block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.photoUrl}
                            alt={`Foto de verificación — ${docName} (${v.presente ? "Presente" : "Ausente"})`}
                            className="h-16 w-24 object-cover rounded-lg border border-zinc-700 group-hover:border-zinc-500 transition-colors"
                          />
                          <span className="flex items-center gap-1 mt-1 text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">
                            <Camera className="h-3 w-3" />
                            {docName} · {v.presente ? "Presente" : "Ausente"}
                          </span>
                        </a>
                      </div>
                    )}

                    {v.notes && (
                      <p className="mt-1.5 text-[11px] text-zinc-400 italic leading-snug">
                        &ldquo;{v.notes}&rdquo;
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
