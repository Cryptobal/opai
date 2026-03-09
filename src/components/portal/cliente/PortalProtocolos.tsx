"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { PreviewBadge } from "./PreviewBadge";

interface ProtocolSection {
  title: string;
  items: string[];
}

interface Protocol {
  id: string;
  title: string;
  version: string;
  updatedAt: string;
  status: string;
  sections: ProtocolSection[];
}

interface Props {
  session: ClienteSession;
  selectedInstallation: string;
  isProspect?: boolean;
}

const DEMO_PROTOCOLOS: Protocol[] = [
  {
    id: "demo-1",
    title: "Protocolo General de Seguridad",
    version: "v2.1",
    updatedAt: "2026-02-15",
    status: "active",
    sections: [
      {
        title: "Control de Acceso",
        items: [
          "Verificación de identidad obligatoria para todo visitante",
          "Registro fotográfico en bitácora digital",
          "Notificación al responsable del área visitada",
        ],
      },
      {
        title: "Rondas de Seguridad",
        items: [
          "Rondas cada 2 horas en horario nocturno",
          "Verificación de perímetro y puntos de acceso",
          "Reporte inmediato de anomalías vía app",
        ],
      },
      {
        title: "Emergencias",
        items: [
          "Protocolo de evacuación según plano de emergencia",
          "Contacto inmediato con central de monitoreo",
          "Coordinación con Carabineros y Bomberos según tipo de emergencia",
        ],
      },
    ],
  },
];

export function PortalProtocolos({ session, selectedInstallation, isProspect }: Props) {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProtocols = useCallback(async () => {
    if (isProspect) {
      setProtocols(DEMO_PROTOCOLOS);
      return;
    }
    if (!selectedInstallation) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/portal/cliente/protocolos?installationId=${encodeURIComponent(selectedInstallation)}`
      );
      const j = await res.json();
      if (j.success) setProtocols(j.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedInstallation, isProspect]);

  useEffect(() => {
    fetchProtocols();
  }, [fetchProtocols]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
      </div>
    );
  }

  if (protocols.length === 0) {
    return (
      <div className="text-center py-16">
        <BookOpen className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-400">No hay protocolos disponibles</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isProspect && (
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold">Protocolos de seguridad</h3>
          <PreviewBadge />
        </div>
      )}
      {protocols.map((protocol) => {
        const isExpanded = expandedId === protocol.id;
        return (
          <div
            key={protocol.id}
            className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : protocol.id)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
              )}
              <BookOpen className="h-4 w-4 text-teal-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{protocol.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-zinc-500">{protocol.version}</span>
                  <span className="text-[10px] text-zinc-600">·</span>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(protocol.updatedAt).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border",
                      protocol.status === "active"
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-zinc-400 bg-zinc-500/10 border-zinc-500/20"
                    )}
                  >
                    {protocol.status === "active" ? "Vigente" : "Borrador"}
                  </span>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-3">
                {protocol.sections.map((section, sIdx) => (
                  <div key={sIdx}>
                    <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                      {section.title}
                    </h4>
                    <ul className="space-y-1.5">
                      {section.items.map((item, iIdx) => (
                        <li key={iIdx} className="flex items-start gap-2 text-sm text-zinc-400">
                          <CheckCircle2 className="h-3.5 w-3.5 text-teal-500 mt-0.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
