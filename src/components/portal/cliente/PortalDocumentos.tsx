"use client";

import { useState, useEffect } from "react";
import { FileText, FileCheck2, BookOpen, FolderOpen, Folder, Loader2, Download, ExternalLink, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PortalContractsSection } from "@/components/portales/PortalContractsSection";
import { PortalProtocolos } from "./PortalProtocolos";
import { PortalDocsOperacionales } from "./PortalDocsOperacionales";
import { ClienteSession } from "@/lib/portal-cliente-types";
import { OpaiBadge } from "./OpaiBadge";
import { PreviewBadge } from "./PreviewBadge";

interface Props {
  session: ClienteSession;
  selectedInstallation?: string;
  isProspect?: boolean;
}

type Tab = "contratos" | "documentos" | "protocolos" | "instalacion" | "operacionales";

const TABS: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: "contratos", label: "Contratos", icon: FileCheck2 },
  { id: "documentos", label: "Documentos", icon: FolderOpen },
  { id: "protocolos", label: "Protocolos", icon: BookOpen },
  { id: "operacionales", label: "Operacionales", icon: ShieldCheck },
  { id: "instalacion", label: "Por instalación", icon: Folder },
];

export function PortalDocumentos({ session, selectedInstallation, isProspect }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("contratos");

  return (
    <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-4 pb-24">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-status-info-fg" />
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
      {activeTab === "documentos" && (
        <PortalCuentaDocumentos isProspect={isProspect} />
      )}
      {activeTab === "protocolos" && (
        <PortalProtocolos
          session={session}
          selectedInstallation={selectedInstallation ?? session.installations[0]?.id ?? ""}
          isProspect={isProspect}
        />
      )}
      {activeTab === "operacionales" && (
        <PortalDocsOperacionales
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

function PortalCuentaDocumentos({ isProspect }: { isProspect?: boolean }) {
  const [folders, setFolders] = useState<Array<{ id: string; name: string; parentId: string | null }>>([]);
  const [files, setFiles] = useState<Array<{ id: string; fileName: string; mimeType: string; size: number; createdAt: string; publicUrl: string | null; folderId: string | null; folderName: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/portal/cliente/documentos")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFolders(data.data.folders ?? []);
          setFiles(data.data.files ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (isProspect) {
    return (
      <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-4 py-3 text-xs text-teal-300/80">
        Al activar tu servicio, aquí encontrarás todos los documentos compartidos por tu proveedor.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-status-info-fg" />
      </div>
    );
  }

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="text-center py-16">
        <FolderOpen className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-zinc-400">Sin documentos disponibles</p>
        <p className="text-xs text-zinc-500 mt-1">Tu proveedor compartirá documentos importantes aquí.</p>
      </div>
    );
  }

  return <FolderFileTree folders={folders} files={files} />;
}

function PortalInstalacionDocumentos({ installationId, isProspect }: { installationId: string; isProspect?: boolean }) {
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [files, setFiles] = useState<Array<{ id: string; fileName: string; mimeType: string; size: number; createdAt: string; publicUrl: string | null; folderId: string | null; folderName: string | null }>>([]);
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
        if (data.success) {
          // La API de instalaciones devuelve lista plana con folderName
          // Reconstruimos carpetas únicas para el agrupado
          const rawFiles: Array<{ id: string; fileName: string; mimeType: string; size: number; createdAt: string; publicUrl: string | null; folderName: string | null }> = data.data;
          const folderMap = new Map<string, { id: string; name: string }>();
          rawFiles.forEach((f) => {
            if (f.folderName && !folderMap.has(f.folderName)) {
              folderMap.set(f.folderName, { id: f.folderName, name: f.folderName });
            }
          });
          setFolders(Array.from(folderMap.values()));
          setFiles(rawFiles.map((f) => ({ ...f, folderId: f.folderName ?? null })));
        }
      })
      .catch(() => setFiles([]))
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
        <Loader2 className="h-8 w-8 animate-spin text-status-info-fg" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-16">
        <FolderOpen className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-zinc-400">Sin documentos disponibles</p>
        <p className="text-xs text-zinc-500 mt-1">La documentación se actualiza automáticamente con cada cambio operativo.</p>
      </div>
    );
  }

  return <FolderFileTree folders={folders} files={files} />;
}

type FileItem = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  publicUrl: string | null;
  folderId: string | null;
  folderName?: string | null;
};

type FolderItem = { id: string; name: string; parentId?: string | null };

function FolderFileTree({ folders, files }: { folders: FolderItem[]; files: FileItem[] }) {
  const rootFiles = files.filter((f) => !f.folderId);
  const filesByFolder = new Map<string, FileItem[]>();
  files.forEach((f) => {
    if (f.folderId) {
      const arr = filesByFolder.get(f.folderId) ?? [];
      arr.push(f);
      filesByFolder.set(f.folderId, arr);
    }
  });

  return (
    <div className="space-y-3">
      {folders.map((folder) => {
        const folderFiles = filesByFolder.get(folder.id) ?? [];
        return (
          <div key={folder.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.04] border-b border-white/[0.06]">
              <Folder className="h-4 w-4 text-teal-400/70 shrink-0" />
              <span className="text-sm font-medium text-zinc-300">{folder.name}</span>
              <span className="ml-auto text-xs text-zinc-500">{folderFiles.length} archivo{folderFiles.length !== 1 ? "s" : ""}</span>
            </div>
            {folderFiles.length === 0 ? (
              <p className="px-4 py-3 text-xs text-zinc-600">Carpeta vacía</p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {folderFiles.map((file) => <FileRow key={file.id} file={file} />)}
              </div>
            )}
          </div>
        );
      })}
      {rootFiles.length > 0 && (
        <div className="space-y-2">
          {rootFiles.map((file) => <FileRow key={file.id} file={file} />)}
        </div>
      )}
    </div>
  );
}

function FileRow({ file }: { file: FileItem }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <FileText className="h-7 w-7 text-teal-400/60 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{file.fileName}</p>
        <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
      </div>
      {file.publicUrl && (
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={file.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded hover:bg-white/10 transition-colors"
            title="Ver"
          >
            <ExternalLink className="h-4 w-4 text-zinc-400" />
          </a>
          <a
            href={`${file.publicUrl}?download=true`}
            download={file.fileName}
            className="p-2 rounded hover:bg-white/10 transition-colors"
            title="Descargar"
          >
            <Download className="h-4 w-4 text-zinc-400" />
          </a>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
