"use client";

import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileCheck,
  AlertCircle,
  Eye,
  Shield,
  UserCheck,
  Loader2,
} from "lucide-react";
import { PreviewBadge } from "./PreviewBadge";

/* ── Types ── */

interface GuardDocument {
  tipo: string;
  status: string;
  fileUrl?: string;
  destacado: boolean;
}

interface Guard {
  nombre: string;
  avatar: string;
  turno: string;
  status: string;
  online: boolean;
  documentos: GuardDocument[];
}

interface Props {
  isProspect?: boolean;
}

/* ── Component ── */

export function PortalPersonal({ isProspect }: Props) {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/portal/cliente/personal")
      .then((r) => r.json())
      .then((data) => {
        setGuards(data.guards || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando personal...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-teal-400" />
          <h2 className="text-lg font-semibold">Personal asignado</h2>
        </div>
        {isProspect && <PreviewBadge />}
      </div>

      {isProspect && (
        <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-4 py-3 mb-4">
          <p className="text-xs text-teal-300/80">
            Visualiza los guardias asignados a tus instalaciones con el estado de sus documentos
            clave (OS-10, antecedentes). En modo activo veras datos en tiempo real.
          </p>
        </div>
      )}

      {guards.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-zinc-500">
          <UserCheck className="h-8 w-8" />
          <p className="text-sm">No hay guardias asignados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {guards.map((guard, idx) => {
            const isExpanded = expandedId === idx;
            const highlighted = guard.documentos.filter((d) => d.destacado);
            const others = guard.documentos.filter((d) => !d.destacado);

            return (
              <div
                key={idx}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden"
              >
                {/* Guard header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : idx)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-teal-600/30 border border-teal-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-teal-300">
                      {guard.avatar}
                    </span>
                  </div>

                  {/* Name + turno */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{guard.nombre}</p>
                    {guard.turno && (
                      <p className="text-xs text-zinc-500 truncate">{guard.turno}</p>
                    )}
                  </div>

                  {/* Online indicator */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        guard.online ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" : "bg-zinc-600"
                      }`}
                    />
                    <span
                      className={`text-xs ${
                        guard.online ? "text-emerald-400" : "text-zinc-500"
                      }`}
                    >
                      {guard.online ? "En servicio" : guard.status}
                    </span>
                  </div>

                  {/* Chevron */}
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded: Documents */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 py-3 space-y-2">
                    {/* Highlighted documents (OS-10, antecedentes) */}
                    {highlighted.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {highlighted.map((doc, di) => (
                          <div
                            key={di}
                            className="flex items-center gap-2 rounded-lg border border-teal-500/20 bg-teal-500/5 px-3 py-2"
                          >
                            <Shield className="h-4 w-4 text-teal-400 flex-shrink-0" />
                            <span className="text-sm text-teal-200 flex-1 truncate">
                              {doc.tipo}
                            </span>
                            <DocStatusBadge status={doc.status} />
                            {doc.fileUrl && !isProspect && (
                              <a
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-white/10 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Eye className="h-3.5 w-3.5 text-zinc-400" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Other documents */}
                    {others.map((doc, di) => (
                      <div
                        key={di}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02]"
                      >
                        <FileCheck className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                        <span className="text-sm text-zinc-300 flex-1 truncate">
                          {doc.tipo}
                        </span>
                        <DocStatusBadge status={doc.status} />
                        {doc.fileUrl && !isProspect && (
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Eye className="h-3.5 w-3.5 text-zinc-400" />
                          </a>
                        )}
                      </div>
                    ))}

                    {guard.documentos.length === 0 && (
                      <p className="text-xs text-zinc-600 py-2">Sin documentos registrados</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Status badge ── */

function DocStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "validated":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
          <FileCheck className="h-3 w-3" />
          Vigente
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
          <AlertCircle className="h-3 w-3" />
          Pendiente
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-400/10 border border-red-400/20 rounded-full px-2 py-0.5">
          <AlertCircle className="h-3 w-3" />
          Rechazado
        </span>
      );
    default:
      return (
        <span className="text-[11px] text-zinc-500 px-2 py-0.5">{status}</span>
      );
  }
}
