"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, FilePlus2, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCUMENT_TYPES } from "@/lib/personas";

const DOC_LABEL: Record<string, string> = {
  certificado_antecedentes: "Certificado de antecedentes",
  certificado_os10: "Certificado OS-10",
  cedula_identidad: "Cédula de identidad",
  curriculum: "Currículum",
  contrato: "Contrato",
  anexo_contrato: "Anexo de contrato",
  certificado_ensenanza_media: "Certificado enseñanza media",
  certificado_afp: "Certificado AFP",
  certificado_fonasa_isapre: "Certificado Fonasa / Isapre",
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

function toDateInput(val: string | Date | undefined | null): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

interface DocumentosSectionProps {
  guardiaId: string;
  documents: GuardiaDocument[];
  canManageDocs: boolean;
  guardiaDocConfig: GuardiaDocConfigItem[];
  onDocumentsChange: (documents: GuardiaDocument[]) => void;
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
  const [docEdits, setDocEdits] = useState<
    Record<string, { status: string; issuedAt: string; expiresAt: string }>
  >({});

  const hasExpirationByType = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of guardiaDocConfig) {
      map.set(c.code, c.hasExpiration);
    }
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

  const getDocEdit = (doc: GuardiaDocument) => {
    return (
      docEdits[doc.id] || {
        status: doc.status,
        issuedAt: toDateInput(doc.issuedAt),
        expiresAt: toDateInput(doc.expiresAt),
      }
    );
  };

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/personas/guardias/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo subir el archivo");
      }
      setDocForm((prev) => ({ ...prev, fileUrl: payload.data.url }));
      toast.success("Archivo subido");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo subir archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!docForm.fileUrl) {
      toast.error("Primero sube un archivo");
      return;
    }
    setCreatingDoc(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardiaId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docForm.type,
          status: docForm.status,
          fileUrl: docForm.fileUrl,
          issuedAt: docForm.issuedAt || null,
          expiresAt: hasExpirationByType.get(docForm.type) ? (docForm.expiresAt || null) : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear documento");
      }
      onDocumentsChange([payload.data, ...documents]);
      setDocForm({
        type: "certificado_antecedentes",
        status: "pendiente",
        issuedAt: "",
        expiresAt: "",
        fileUrl: "",
      });
      toast.success("Documento agregado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear documento");
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleSaveDocument = async (doc: GuardiaDocument) => {
    const edit = getDocEdit(doc);
    setSavingDocId(doc.id);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardiaId}/documents?documentId=${encodeURIComponent(doc.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: edit.status,
            issuedAt: edit.issuedAt || null,
            expiresAt: hasExpirationByType.get(doc.type) ? (edit.expiresAt || null) : null,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo actualizar documento");
      }
      onDocumentsChange(
        documents.map((it) => (it.id === doc.id ? payload.data : it))
      );
      toast.success("Documento actualizado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar documento");
    } finally {
      setSavingDocId(null);
    }
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
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo eliminar documento");
      }
      onDocumentsChange(documents.filter((it) => it.id !== doc.id));
      toast.success("Documento eliminado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar documento");
    } finally {
      setDeletingDocId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sube certificado de antecedentes, OS-10, cédula de identidad, currículum, contratos y anexos.
      </p>
      {expiringDocs.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          Hay {expiringDocs.length} documento(s) vencido(s) o por vencer.
        </div>
      ) : null}
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
        <p className="text-sm font-medium">Subir nuevo documento</p>
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="text-xs text-muted-foreground block mb-1.5">Tipo de documento</label>
            <select
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={docForm.type}
              onChange={(e) => {
                const nextType = e.target.value;
                setDocForm((prev) => ({
                  ...prev,
                  type: nextType,
                  expiresAt: hasExpirationByType.get(nextType) ? prev.expiresAt : "",
                }));
              }}
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DOC_LABEL[type] || type}
                </option>
              ))}
            </select>
          </div>
          {hasExpirationByType.get(docForm.type) && (
            <div className="md:col-span-4">
              <label className="text-xs text-muted-foreground block mb-1.5">Vencimiento</label>
              <div className="flex items-center gap-2">
                <Input
                  ref={expiresAtRef}
                  type="date"
                  value={docForm.expiresAt}
                  onChange={(e) => setDocForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => expiresAtRef.current?.showPicker?.()}
                  aria-label="Abrir calendario de vencimiento"
                >
                  <CalendarDays className="h-4 w-4 text-white" />
                </Button>
              </div>
            </div>
          )}
          <div className="md:col-span-4 flex flex-col justify-end gap-2">
            <label className="text-xs text-muted-foreground">Archivo (PDF, imagen)</label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
                disabled={uploading || !canManageDocs}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={uploading || !canManageDocs}
                onClick={() => fileInputRef.current?.click()}
                title="Seleccionar archivo"
              >
                <FilePlus2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreateDocument}
                disabled={creatingDoc || !docForm.fileUrl || uploading || !canManageDocs}
              >
                <Upload className="h-4 w-4 mr-1" />
                {creatingDoc ? "Guardando..." : "Cargar"}
              </Button>
            </div>
            {docForm.fileUrl && (
              <span className="text-xs text-green-600 dark:text-green-400">Archivo listo · haz clic en Cargar</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Documentos cargados</p>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay documentos. Usa el bloque de arriba para subir el primero.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {documents.map((doc) => {
              const edit = getDocEdit(doc);
              return (
                <div key={doc.id} className="rounded-md border border-border p-4 space-y-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">{DOC_LABEL[doc.type] || doc.type}</p>
                    {hasExpirationByType.get(doc.type) && (
                      <p className="text-xs text-muted-foreground">
                        {doc.expiresAt ? `Vence: ${new Date(doc.expiresAt).toLocaleDateString("es-CL")}` : "Sin vencimiento"}
                      </p>
                    )}
                  </div>
                  {hasExpirationByType.get(doc.type) && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground block">Vencimiento</label>
                      <Input
                        type="date"
                        value={edit.expiresAt}
                        disabled={!canManageDocs}
                        onChange={(e) =>
                          setDocEdits((prev) => ({
                            ...prev,
                            [doc.id]: { ...edit, expiresAt: e.target.value },
                          }))
                        }
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a href={doc.fileUrl || "#"} target="_blank" rel="noreferrer">
                        Ver archivo
                      </a>
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSaveDocument(doc)}
                        disabled={savingDocId === doc.id || !canManageDocs}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        {savingDocId === doc.id ? "..." : "Guardar"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleDeleteDocument(doc)}
                        disabled={deletingDocId === doc.id || !canManageDocs}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {documents.length} documento(s) · tipos: antecedentes, OS-10, cédula, currículum, contrato, anexo.
      </p>
    </div>
  );
}
