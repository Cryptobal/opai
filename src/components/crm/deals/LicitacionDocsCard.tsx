"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { EmptyState, IconBubble, Spinner, Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { toast } from "sonner";

type DocRow = {
  fileId: string;
  fileName: string;
  tipoCodigo: string | null;
  tipoNombre: string | null;
  kind: "bases" | "qa" | "anexos" | null;
  needsClassification: boolean;
  suggestedCodigo: string | null;
  extractStatus: "ok" | "error" | "stale" | "pending" | "none";
  extractError: string | null;
  stale: boolean;
};

type TypeRow = { codigo: string; nombre: string; present: boolean; extracted: boolean };

export function LicitacionDocsCard({
  dealId,
  dealTitle,
}: {
  dealId: string;
  dealTitle: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [types, setTypes] = useState<TypeRow[]>([]);
  const [files, setFiles] = useState<DocRow[]>([]);
  const [gate, setGate] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/licitacion-docs`);
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { types: TypeRow[]; files: DocRow[]; gate: string | null };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error || "No se pudieron cargar los documentos");
        return;
      }
      setTypes(json.data.types);
      setFiles(json.data.files);
      setGate(json.data.gate);
    } catch {
      setError("No se pudieron cargar los documentos");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function classify(fileId: string, tipoCodigo: string) {
    setBusyId(fileId);
    try {
      const res = await fetch(`/api/crm/files/${fileId}/classify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoCodigo, entityType: "deal", entityId: dealId }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo clasificar");
        return;
      }
      toast.success("Clasificado e ingestado");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function reprocess(fileId: string) {
    setBusyId(fileId);
    try {
      const res = await fetch(`/api/crm/files/${fileId}/reprocess-text`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        toast.error(json.error || "No se pudo reprocesar");
        return;
      }
      toast.success("Texto reextraído");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <IconBubble icon={FileText} variant="info" size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ds-text-1">Documentos de licitación</p>
            <p className="text-[12px] text-ds-text-3">Bases, Q&A y anexos con texto extraído</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-10 sm:h-9 shrink-0"
          onClick={() =>
            openAnchoredChat({ anchorType: "crm_deal", anchorId: dealId, entityName: dealTitle })
          }
        >
          <MessageCircle className="h-4 w-4" />
          Abrir chat
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
          <Spinner size="sm" /> Cargando documentos…
        </div>
      ) : error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <Tag key={t.codigo} variant={t.extracted ? "ok" : t.present ? "warn" : "neutral"} size="sm">
                {t.nombre}: {t.extracted ? "texto listo" : t.present ? "sin texto" : "faltan"}
              </Tag>
            ))}
          </div>
          {gate ? (
            <p className="rounded-lg bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">{gate}</p>
          ) : (
            <p className="text-[13px] text-status-ok-fg">Bases listas. Podés pedir el índice en el chat.</p>
          )}
          {files.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Sin archivos en el negocio"
              description="Subí las bases (PDF con texto) en Documentos y clasificalas."
            />
          ) : (
            <ul className="ds-list-cascade space-y-2">
              {files.map((f) => (
                <li
                  key={f.fileId}
                  className="flex flex-col gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ds-text-1">{f.fileName}</p>
                    <p className="text-[12px] text-ds-text-3">
                      {f.tipoNombre ?? "Sin clasificar"}
                      {f.extractStatus === "ok" ? " · texto extraído" : ""}
                      {f.extractStatus === "error" ? ` · ${f.extractError ?? "sin texto"}` : ""}
                      {f.stale ? " · archivo actualizado, reprocesá" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {f.needsClassification && f.suggestedCodigo ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 sm:h-9"
                        disabled={busyId === f.fileId}
                        onClick={() => void classify(f.fileId, f.suggestedCodigo!)}
                      >
                        Aceptar {f.suggestedCodigo.replace("_licitacion", "")}
                      </Button>
                    ) : null}
                    {(f.extractStatus === "error" || f.stale || f.extractStatus === "none") && f.tipoCodigo ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-10 sm:h-9"
                        disabled={busyId === f.fileId}
                        onClick={() => void reprocess(f.fileId)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reprocesar
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Surface>
  );
}
