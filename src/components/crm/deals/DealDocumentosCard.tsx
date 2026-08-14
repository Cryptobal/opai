"use client";

import { useRef, useState } from "react";
import { ExternalLink, FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, Surface, Tag } from "@/components/opai-ds";
import { toast } from "sonner";
import type { LicitacionDocRow } from "./useDealLicitacionDocs";
import {
  DealFileSuggestChip,
  DealFileTipoMenu,
  DealUploadAsSelect,
} from "./DealFileTipoControls";

export function DealDocumentosCard({
  dealId,
  files,
  loading,
  error,
  onReload,
  onOpenFolder,
  driveUrl,
  showClassification = false,
  onClassify,
}: {
  dealId: string;
  files: LicitacionDocRow[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onOpenFolder: () => void;
  driveUrl?: string | null;
  showClassification?: boolean;
  onClassify?: (fileId: string, tipoCodigo: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadAs, setUploadAs] = useState("auto");

  const suggestions = showClassification
    ? files.filter((f) => f.needsClassification && f.suggestedCodigo)
    : [];

  async function classify(fileId: string, tipoCodigo: string | null) {
    if (!onClassify) return;
    setBusy(fileId);
    try {
      const result = await onClassify(fileId, tipoCodigo);
      if (!result.ok) {
        toast.error(result.error || "No se pudo clasificar");
        return;
      }
      toast.success(tipoCodigo ? "Clasificado" : "Tipo quitado");
    } finally {
      setBusy(null);
    }
  }

  async function acceptAll() {
    for (const f of suggestions) {
      if (f.suggestedCodigo) await classify(f.fileId, f.suggestedCodigo);
    }
  }

  async function upload(file: File) {
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entityType", "deal");
      fd.append("entityId", dealId);
      if (showClassification) fd.append("tipoCodigo", uploadAs);
      const res = await fetch("/api/crm/files/upload", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo subir");
        return;
      }
      toast.success("Archivo subido");
      onReload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Surface elevation={1} padding="sm" className="space-y-2 lg:space-y-3 lg:p-4">
      <div className="flex min-h-10 items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ds-text-3">Documentos</p>
        <div className="flex items-center gap-1">
          <Tag variant={files.length ? "ok" : "neutral"} size="sm">
            {files.length ? `${files.length}` : "0"}
          </Tag>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
          <Spinner size="sm" /> Cargando…
        </div>
      ) : error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : files.length === 0 ? (
        <p className="text-[13px] text-ds-text-3">Sin archivos en la carpeta.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.slice(0, 8).map((f) => (
            <li key={f.fileId} className="flex min-h-10 flex-wrap items-center justify-between gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-1">{f.fileName}</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {showClassification && f.needsClassification && f.suggestedCodigo ? (
                  <DealFileSuggestChip
                    suggestedCodigo={f.suggestedCodigo}
                    disabled={Boolean(busy)}
                    onAccept={() => void classify(f.fileId, f.suggestedCodigo)}
                  />
                ) : null}
                {showClassification ? (
                  <DealFileTipoMenu
                    tipoCodigo={f.tipoCodigo}
                    tipoNombre={f.tipoNombre}
                    disabled={Boolean(busy)}
                    onSelect={(codigo) => void classify(f.fileId, codigo)}
                  />
                ) : (
                  <Tag variant={f.tipoNombre ? "neutral" : "warn"} size="md">
                    {f.tipoNombre ?? "Sin tipo"}
                  </Tag>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 w-full sm:h-9"
          disabled={Boolean(busy)}
          onClick={() => void acceptAll()}
        >
          Aceptar y clasificar ({suggestions.length})
        </Button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {showClassification ? (
        <DealUploadAsSelect value={uploadAs} onChange={setUploadAs} disabled={busy === "upload"} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-10 sm:h-9"
          disabled={busy === "upload"}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Subir
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-10 sm:h-9" onClick={onOpenFolder}>
          <FolderOpen className="h-4 w-4" />
          Ver carpeta completa
        </Button>
        {driveUrl ? (
          <Button type="button" size="sm" variant="ghost" className="h-10 sm:h-9" asChild>
            <a href={driveUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Drive
            </a>
          </Button>
        ) : null}
      </div>
    </Surface>
  );
}
