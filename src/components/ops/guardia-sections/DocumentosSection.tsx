"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Check, Clock, ExternalLink, FilePlus2, MoreHorizontal, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DOCUMENT_TYPES } from "@/lib/personas";
import { cn } from "@/lib/utils";

const DOC_LABEL: Record<string, string> = {
  certificado_antecedentes: "Cert. antecedentes",
  certificado_os10: "Certificado OS-10",
  cedula_identidad: "Cédula de identidad",
  curriculum: "Currículum",
  contrato: "Contrato",
  anexo_contrato: "Anexo de contrato",
  certificado_ensenanza_media: "Cert. enseñanza media",
  certificado_afp: "Certificado AFP",
  certificado_fonasa_isapre: "Cert. Fonasa / Isapre",
};

type GuardiaDocument = {
  id: string;
  type: string;
  status: string;
  fileUrl?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

type GuardiaDocConfigItem = { code: string; hasExpiration: boolean; alertDaysBefore: number };

interface DocumentosSectionProps {
  guardiaId: string;
  documents: GuardiaDocument[];
  canManageDocs: boolean;
  guardiaDocConfig: GuardiaDocConfigItem[];
  onDocumentsChange: (documents: GuardiaDocument[]) => void;
}

function getDocStatusIcon(doc: GuardiaDocument, hasExpiration: boolean, guardiaDocConfig: GuardiaDocConfigItem[]) {
  if (!doc.fileUrl) {
    return <X className="h-3.5 w-3.5 text-red-400" />;
  }
  if (hasExpiration && doc.expiresAt) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cfg = guardiaDocConfig.find((c) => c.code === doc.type);
    const daysBefore = cfg?.alertDaysBefore ?? 30;
    const limit = new Date(today);
    limit.setDate(limit.getDate() + daysBefore);
    const exp = new Date(doc.expiresAt);
    if (exp <= today) return <X className="h-3.5 w-3.5 text-red-400" />;
    if (exp <= limit) return <Clock className="h-3.5 w-3.5 text-amber-400" />;
  }
  return <Check className="h-3.5 w-3.5 text-emerald-400" />;
}

function formatExpiration(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const d = new Date(expiresAt);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export default function DocumentosSection({
  guardiaId,
  documents,
  canManageDocs,
  guardiaDocConfig,
  onDocumentsChange,
}: DocumentosSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [docForm, setDocForm] = useState({
    type: "certificado_antecedentes",
    status: "pendiente",
    issuedAt: "",
    expiresAt: "",
    fileUrl: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const expiresAtRef = useRef<HTMLInputElement | null>(null);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const hasExpirationByType = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of guardiaDocConfig) map.set(c.code, c.hasExpiration);
    return map;
  }, [guardiaDocConfig]);

  const expiringDocs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return documents.filter((doc) => {
      if (!doc.expiresAt || !hasExpirationByType.get(doc.type)) return false;
      const cfg = guardiaDocConfig.find((c) => c.code === doc.type);
      const daysBefore = cfg?.alertDaysBefore ?? 30;
      const limit = new Date(today);
      limit.setDate(limit.getDate() + daysBefore);
      const exp = new Date(doc.expiresAt);
      return exp <= limit;
    });
  }, [documents, guardiaDocConfig, hasExpirationByType]);

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/personas/guardias/upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo subir el archivo");
      setDocForm((prev) => ({ ...prev, fileUrl: payload.data.url }));
      toast.success("Archivo subido");
    } catch (error) { console.error(error); toast.error("No se pudo subir archivo"); }
    finally { setUploading(false); }
  };

  const handleCreateDocument = async () => {
    if (!docForm.fileUrl) { toast.error("Primero sube un archivo"); return; }
    setCreatingDoc(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardiaId}/documents`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docForm.type, status: docForm.status, fileUrl: docForm.fileUrl,
          issuedAt: docForm.issuedAt || null,
          expiresAt: hasExpirationByType.get(docForm.type) ? (docForm.expiresAt || null) : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo crear documento");
      onDocumentsChange([payload.data, ...documents]);
      setDocForm({ type: "certificado_antecedentes", status: "pendiente", issuedAt: "", expiresAt: "", fileUrl: "" });
      toast.success("Documento agregado");
    } catch (error) { console.error(error); toast.error("No se pudo crear documento"); }
    finally { setCreatingDoc(false); }
  };

  const handleSaveDocument = async (doc: GuardiaDocument, expiresAt?: string) => {
    setSavingDocId(doc.id);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardiaId}/documents?documentId=${encodeURIComponent(doc.id)}`,
        {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: doc.status,
            issuedAt: doc.issuedAt || null,
            expiresAt: hasExpirationByType.get(doc.type) ? (expiresAt || doc.expiresAt || null) : null,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar documento");
      onDocumentsChange(documents.map((it) => (it.id === doc.id ? payload.data : it)));
      toast.success("Documento actualizado");
    } catch (error) { console.error(error); toast.error("No se pudo actualizar documento"); }
    finally { setSavingDocId(null); }
  };

  const handleDeleteDocument = async (doc: GuardiaDocument) => {
    if (!window.confirm("¿Eliminar este documento?")) return;
    setDeletingDocId(doc.id);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardiaId}/documents?documentId=${encodeURIComponent(doc.id)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo eliminar documento");
      onDocumentsChange(documents.filter((it) => it.id !== doc.id));
      toast.success("Documento eliminado");
    } catch (error) { console.error(error); toast.error("No se pudo eliminar documento"); }
    finally { setDeletingDocId(null); }
  };

  return (
    <div className="space-y-4">
      {expiringDocs.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {expiringDocs.length} documento(s) vencido(s) o por vencer
        </div>
      )}

      {/* Upload new document */}
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
        <p className="text-xs font-medium text-[#e8edf4]">Subir nuevo documento</p>
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-xs flex-1 min-w-[140px]"
            value={docForm.type}
            onChange={(e) => {
              const nextType = e.target.value;
              setDocForm((prev) => ({ ...prev, type: nextType, expiresAt: hasExpirationByType.get(nextType) ? prev.expiresAt : "" }));
            }}
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>{DOC_LABEL[type] || type}</option>
            ))}
          </select>
          {hasExpirationByType.get(docForm.type) && (
            <div className="flex items-center gap-1">
              <Input ref={expiresAtRef} type="date" value={docForm.expiresAt}
                onChange={(e) => setDocForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                className="h-8 text-xs w-[130px]" />
              <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0"
                onClick={() => expiresAtRef.current?.showPicker?.()}>
                <CalendarDays className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden"
            onChange={(e) => void handleUpload(e.target.files?.[0])} disabled={uploading || !canManageDocs} />
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
            disabled={uploading || !canManageDocs} onClick={() => fileInputRef.current?.click()}>
            <FilePlus2 className="h-3.5 w-3.5 mr-1" />{uploading ? "Subiendo..." : "Archivo"}
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs"
            onClick={handleCreateDocument} disabled={creatingDoc || !docForm.fileUrl || uploading || !canManageDocs}>
            <Upload className="h-3.5 w-3.5 mr-1" />{creatingDoc ? "..." : "Cargar"}
          </Button>
        </div>
        {docForm.fileUrl && <span className="text-[11px] text-green-400">Archivo listo</span>}
      </div>

      {/* Compact document list */}
      {documents.length === 0 ? (
        <p className="text-xs text-[#7a8a9e] py-1">Sin documentos cargados.</p>
      ) : (
        <div className="rounded-lg border border-[#1a2332] divide-y divide-[#1a2332]">
          {documents.map((doc) => {
            const hasExpiration = hasExpirationByType.get(doc.type) ?? false;
            const expStr = hasExpiration ? formatExpiration(doc.expiresAt) : null;
            return (
              <div key={doc.id} className="flex items-center gap-2 px-3 py-2 min-w-0 hover:bg-[#111822]/50 transition-colors">
                {getDocStatusIcon(doc, hasExpiration, guardiaDocConfig)}
                <span className="text-sm text-[#e8edf4] truncate flex-1 min-w-0">
                  {DOC_LABEL[doc.type] || doc.type}
                </span>
                {expStr && (
                  <span className="text-[11px] text-[#7a8a9e] shrink-0 hidden sm:inline">
                    Vence: {expStr}
                  </span>
                )}
                {doc.fileUrl ? (
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[#1a2332] bg-[#111822] px-2 py-1 text-[11px] text-[#e8edf4] hover:bg-[#1a2332] transition-colors shrink-0">
                    <ExternalLink className="h-3 w-3" /> Ver
                  </a>
                ) : (
                  <span className="text-[11px] text-[#4a5568] shrink-0">Sin archivo</span>
                )}
                {canManageDocs && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void handleSaveDocument(doc)} disabled={savingDocId === doc.id}>
                        Guardar cambios
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 focus:text-red-400"
                        onClick={() => void handleDeleteDocument(doc)}
                        disabled={deletingDocId === doc.id}
                      >
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-[#4a5568]">{documents.length} documento(s)</p>
    </div>
  );
}
