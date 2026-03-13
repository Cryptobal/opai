"use client";

import { useState, useEffect } from "react";
import { FileText, FileCheck2, BookOpen, FolderOpen, Loader2, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalContractsSection } from "@/components/portales/PortalContractsSection";
import { PortalProtocolos } from "./PortalProtocolos";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { OpaiBadge } from "./OpaiBadge";
import { PreviewBadge } from "./PreviewBadge";

interface Props {
  session: ClienteSession;
  selectedInstallation?: string;
  isProspect?: boolean;
}

type Tab = "contratos" | "protocolos" | "instalacion";

const TABS: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: "contratos", label: "Contratos", icon: FileCheck2 },
  { id: "protocolos", label: "Protocolos", icon: BookOpen },
  { id: "instalacion", label: "Documentos instalación", icon: FolderOpen },
];

export function PortalDocumentos({ session, selectedInstallation, isProspect }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("contratos");

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-400" />
          Documentación digital
          <OpaiBadge text="Cumplimiento automático" variant="default" />
          {isProspect && <PreviewBadge />}
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          {isProspect
            ? "Documentación 100% digital — Cero papel, cero excusas"
            : "Contratos, OS-10, antecedentes — Todo en un solo lugar"}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-zinc-800/50 p-1 rounded-lg">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
                activeTab === tab.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "contratos" && (
        <PortalContractsSection
          tenantId={session.tenantId}
          accountId={session.accountId}
        />
      )}
      {activeTab === "protocolos" && (
        <PortalProtocolos
          session={session}
          selectedInstallation={selectedInstallation ?? session.installations[0]?.id ?? ""}
          isProspect={isProspect}
        />
      )}
      {activeTab === "instalacion" && (
        <PortalInstalacionDocumentos
          installationId={selectedInstallation ?? session.installations[0]?.id ?? ""}
          isProspect={isProspect}
        />
      )}
    </div>
  );
}

function PortalInstalacionDocumentos({ installationId, isProspect }: { installationId: string; isProspect?: boolean }) {
  const [docs, setDocs] = useState<Array<{ id: string; fileName: string; mimeType: string; size: number; createdAt: string; publicUrl: string | null; folderName: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!installationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/portal/cliente/instalaciones/${installationId}/documentos`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setDocs(data.data);
      })
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [installationId]);

  if (isProspect) {
    return (
      <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-4 py-3 text-xs text-teal-300/80">
        Al activar tu servicio, aquí encontrarás todos los documentos de tu instalación actualizados automáticamente.
      </div>
    );
  }

  if (!installationId) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm">
        Selecciona una instalación para ver sus documentos.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="text-center py-16">
        <FolderOpen className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-zinc-400">Sin documentos disponibles</p>
        <p className="text-xs text-zinc-500 mt-1">La documentación se actualiza automáticamente con cada cambio operativo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
        >
          <FileText className="h-8 w-8 text-teal-400/70 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{doc.fileName}</p>
            {doc.folderName && (
              <p className="text-xs text-zinc-500 truncate">{doc.folderName}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {doc.publicUrl && (
              <>
                <a
                  href={doc.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded hover:bg-white/10 transition-colors"
                  title="Ver"
                >
                  <ExternalLink className="h-4 w-4 text-zinc-400" />
                </a>
                <a
                  href={`${doc.publicUrl}?download=true`}
                  download={doc.fileName}
                  className="p-2 rounded hover:bg-white/10 transition-colors"
                  title="Descargar"
                >
                  <Download className="h-4 w-4 text-zinc-400" />
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
