"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FileCheck2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { PreviewBadge } from "./PreviewBadge";
import { usePortalData } from "@/hooks/usePortalData";
import { ProtocolSignModal } from "./ProtocolSignModal";

interface ProtocolSection {
  title: string;
  items: string[];
}

interface ProtocolAcceptance {
  id: string;
  acceptedAt: string;
  firmanteNombre: string;
  versionNumber: number;
}

interface Protocol {
  id: string;
  title: string;
  version: string;
  updatedAt: string;
  status: string;
  lastAcceptance: ProtocolAcceptance | null;
  requiresSignature: boolean;
  sections: ProtocolSection[];
}

interface Props {
  session: ClienteSession;
  selectedInstallation: string;
  isProspect?: boolean;
}

export function PortalProtocolosLista({ selectedInstallation }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [localSigned, setLocalSigned] = useState<Record<string, string>>({});

  const { data, loading, isDemo, refetch } = usePortalData<Protocol[]>({
    endpoint: "/api/portal/cliente/protocolos",
    demoKey: "protocolos_list",
    params: selectedInstallation ? { installationId: selectedInstallation } : undefined,
    skip: !selectedInstallation,
  });

  const protocols = data ?? [];

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

  const signingProtocol = protocols.find((p) => p.id === signingId);

  return (
    <div className="space-y-3">
      {isDemo && (
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold">Protocolos de seguridad</h3>
          <PreviewBadge />
        </div>
      )}
      {protocols.map((protocol) => {
        const isExpanded = expandedId === protocol.id;
        const localSignedAt = localSigned[protocol.id];
        const acceptance = protocol.lastAcceptance;
        const signedDisplay = localSignedAt ?? acceptance?.acceptedAt ?? null;
        const needsSign =
          !isDemo && (protocol.requiresSignature || !acceptance) && !localSignedAt;
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
                        : "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
                    )}
                  >
                    {protocol.status === "active" ? "Vigente" : "Borrador"}
                  </span>
                  {signedDisplay && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                      ✓ Firmado
                    </span>
                  )}
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

                {signedDisplay && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <p className="text-xs text-emerald-300">
                      ✓ Firmado
                      {acceptance?.firmanteNombre ? ` por ${acceptance.firmanteNombre}` : ""} el{" "}
                      {new Date(signedDisplay).toLocaleDateString("es-CL")}
                    </p>
                    {protocol.requiresSignature && !localSignedAt && (
                      <p className="text-xs text-amber-400 mt-1">
                        Nueva versión disponible — firma requerida.
                      </p>
                    )}
                  </div>
                )}

                {needsSign && (
                  <button
                    onClick={() => setSigningId(protocol.id)}
                    className="w-full mt-3 h-10 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    {acceptance ? "Firmar nueva versión" : "Aceptar y firmar protocolo"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {signingProtocol && (
        <ProtocolSignModal
          protocolId={signingProtocol.id}
          protocolTitle={signingProtocol.title}
          protocolVersion={signingProtocol.version}
          onClose={() => setSigningId(null)}
          onSigned={(acceptedAt) => {
            setLocalSigned((prev) => ({ ...prev, [signingProtocol.id]: acceptedAt }));
            setSigningId(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
