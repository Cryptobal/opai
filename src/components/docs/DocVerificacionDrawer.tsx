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
  vigente: { label: "Vigente", color: "text-green-400" },
  por_vencer: { label: "Por vencer", color: "text-amber-400" },
  vencido: { label: "Vencido", color: "text-red-400" },
  sin_documento: { label: "Sin documento", color: "text-zinc-400" },
  no_aplica: { label: "No aplica", color: "text-zinc-500" },
};

const CAPA_LABELS: Record<string, string> = {
  global: "Global",
  instalacion: "Instalación",
  guardia: "Guardia",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  major: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  minor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
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

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    setVerificaciones([]);

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
        ? "text-green-400"
        : "text-red-400";

  const ultimaVerifIso = lastVerif?.createdAt ?? cellMeta?.ultimaVerificacion ?? null;
  const supervisorName = lastVerif?.supervisor?.name ?? cellMeta?.supervisorName ?? null;

  // Hallazgos abiertos (pasados por la celda si existen)
  const hallazgosAbiertos = (cellMeta?.hallazgos ?? []).filter(
    (h) => h.status === "open" || h.status === "in_progress",
  );

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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                <AlertTriangle className="h-3 w-3" />
                Obligatorio en visita
              </span>
            )}
            {hallazgosAbiertos.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                <AlertTriangle className="h-3 w-3" />
                {hallazgosAbiertos.length} hallazgo{hallazgosAbiertos.length > 1 ? "s" : ""} abierto
                {hallazgosAbiertos.length > 1 ? "s" : ""}
              </span>
            )}
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

        {/* Hallazgos abiertos */}
        {hallazgosAbiertos.length > 0 && (
          <div className="px-5 py-4 border-b border-zinc-800">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-400" />
              Hallazgos abiertos
            </p>
            <div className="space-y-2">
              {hallazgosAbiertos.map((h) => (
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
                  {h.ticketId && (
                    <a
                      href={`/ops/tickets/${h.ticketId}`}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 underline underline-offset-2"
                    >
                      Ver ticket
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
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
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
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
                      <CheckCircle2 className="h-4 w-4 text-green-400 bg-zinc-900 rounded-full" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 bg-zinc-900 rounded-full" />
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
                          ? "bg-green-500/15 text-green-400 border border-green-500/25"
                          : "bg-red-500/15 text-red-400 border border-red-500/25"
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
                          className="text-[11px] text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
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
                            alt="Foto de verificación"
                            className="h-16 w-24 object-cover rounded-lg border border-zinc-700 group-hover:border-zinc-500 transition-colors"
                          />
                          <span className="flex items-center gap-1 mt-1 text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">
                            <Camera className="h-3 w-3" />
                            Ver foto
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
