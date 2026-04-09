"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
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
  guardiaDocType?: string | null;
  installationId: string;
  guardiaId?: string | null;
};

type Hallazgo = {
  id: string;
  ticketId: string | null;
  severity: string | null;
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
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
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
  guardiaDocType,
  installationId,
  guardiaId,
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
  }, [open, installationId, capa, tipoDocId, guardiaDocType, guardiaId]);

  const digitalMeta = DIGITAL_STATUS_LABELS[digitalStatus] ?? {
    label: digitalStatus,
    color: "text-zinc-400",
  };

  // Derive physical status from last verification
  const lastVerif = verificaciones[0] ?? null;
  const fisicoLabel = lastVerif === null
    ? "Sin verificar"
    : lastVerif.presente
    ? "Presente"
    : "Ausente";
  const fisicoColor = lastVerif === null
    ? "text-zinc-400"
    : lastVerif.presente
    ? "text-green-400"
    : "text-red-400";

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-zinc-900 border-zinc-800 text-zinc-100 flex flex-col p-0 gap-0 overflow-hidden"
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
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

          {/* Badges row */}
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
          </div>
        </SheetHeader>

        {/* ---------------------------------------------------------------- */}
        {/* Status cards                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-zinc-800">
          {/* Digital status */}
          <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Digital</p>
            <p className={`text-sm font-semibold ${digitalMeta.color}`}>{digitalMeta.label}</p>
          </div>

          {/* Physical status */}
          <div className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/50">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Físico</p>
            <p className={`text-sm font-semibold ${fisicoColor}`}>{fisicoLabel}</p>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Timeline                                                          */}
        {/* ---------------------------------------------------------------- */}
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
            </div>
          )}

          {!loading && !error && verificaciones.length > 0 && (
            <ol className="relative border-l border-zinc-800 space-y-0 ml-2">
              {verificaciones.map((v) => (
                <li key={v.id} className="ml-4 pb-6 last:pb-0">
                  {/* Timeline dot */}
                  <span className="absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full ring-2 ring-zinc-900">
                    {v.presente ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400 bg-zinc-900 rounded-full" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 bg-zinc-900 rounded-full" />
                    )}
                  </span>

                  <div className="ml-1">
                    {/* Date / supervisor */}
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-zinc-300">
                        {v.supervisor?.name ?? "Supervisor desconocido"}
                      </span>
                      <span className="text-[11px] text-zinc-500 shrink-0">
                        {formatDateTime(v.createdAt)}
                      </span>
                    </div>

                    {/* Result badge */}
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

                    {/* Hallazgo badge */}
                    {v.hallazgo && (
                      <span
                        className={`ml-2 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          SEVERITY_COLORS[v.hallazgo.severity ?? ""] ??
                          "bg-zinc-700/50 text-zinc-400 border-zinc-600"
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Hallazgo
                        {v.hallazgo.ticketId && (
                          <span className="opacity-70">#{v.hallazgo.ticketId}</span>
                        )}
                      </span>
                    )}

                    {/* Visit link */}
                    {v.supervision && (
                      <div className="mt-1.5">
                        <a
                          href={`/operacional/supervisiones/${v.supervision.id}`}
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

                    {/* Photo thumbnail */}
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

                    {/* Notes */}
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
