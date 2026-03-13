"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Check, Clock, Download, Eye, EyeOff, FilePlus2, Folder, FolderPlus, ChevronDown, ChevronRight, Pencil, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DOCUMENT_TYPES } from "@/lib/personas";
import { cn } from "@/lib/utils";
import { FilePreviewModal } from "@/components/ui/FilePreviewModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  folderId?: string | null;
  portalVisible?: boolean;
  folder?: { id: string; name: string; portalVisible: boolean } | null;
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
    folderId: "" as string | null,
  });
  const [folders, setFolders] = useState<Array<{ id: string; name: string; portalVisible: boolean; parentId?: string | null }>>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const expiresAtRef = useRef<HTMLInputElement | null>(null);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<GuardiaDocument | null>(null);

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
          folderId: docForm.folderId || null,
          portalVisible: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo crear documento");
      onDocumentsChange([payload.data, ...documents]);
      setDocForm({ type: "certificado_antecedentes", status: "pendiente", issuedAt: "", expiresAt: "", fileUrl: "", folderId: null });
      toast.success("Documento agregado");
    } catch (error) { console.error(error); toast.error("No se pudo crear documento"); }
    finally { setCreatingDoc(false); }
  };

  const handleTogglePortalVisible = async (doc: GuardiaDocument) => {
    try {
      const res = await fetch(
        `/api/personas/guardias/${guardiaId}/documents?documentId=${encodeURIComponent(doc.id)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portalVisible: !doc.portalVisible }) }
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error);
      onDocumentsChange(documents.map((d) => (d.id === doc.id ? { ...d, portalVisible: payload.data.portalVisible } : d)));
      toast.success(doc.portalVisible ? "Ocultado del portal" : "Visible en portal");
    } catch { toast.error("Error al actualizar visibilidad"); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/crm/folders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), entityType: "guardia", entityId: guardiaId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) => [...prev, data.data]);
      setNewFolderName("");
      setCreatingFolder(false);
      toast.success("Carpeta creada");
    } catch { toast.error("Error al crear carpeta"); setCreatingFolder(false); }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/crm/folders/${folderId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: data.data.name } : f)));
      onDocumentsChange(documents.map((d) => (d.folderId === folderId && d.folder) ? { ...d, folder: { ...d.folder, name: data.data.name } } : d)));
      setRenamingFolderId(null);
      setRenameValue("");
      toast.success("Carpeta renombrada");
    } catch { toast.error("Error al renombrar"); }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      const res = await fetch(`/api/crm/folders/${folderId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      onDocumentsChange(documents.map((d) => (d.folderId === folderId ? { ...d, folderId: null, folder: null } : d)));
      toast.success("Carpeta eliminada");
    } catch { toast.error("Error al eliminar carpeta"); }
  };

  const handleToggleFolderPortalVisible = async (folder: { id: string; name: string; portalVisible: boolean }) => {
    try {
      const res = await fetch(`/api/crm/folders/${folder.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portalVisible: !folder.portalVisible }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, portalVisible: data.data.portalVisible } : f)));
      toast.success(folder.portalVisible ? "Carpeta oculta del portal" : "Carpeta visible en portal");
    } catch { toast.error("Error al actualizar visibilidad"); }
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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/crm/folders?entityType=guardia&entityId=${encodeURIComponent(guardiaId)}`
      );
      const data = await res.json();
      if (data.success) setFolders(data.data);
    } catch { /* silent */ }
  }, [guardiaId]);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  const handleDeleteDocument = async (docId: string) => {
    setDeletingDocId(docId);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardiaId}/documents?documentId=${encodeURIComponent(docId)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo eliminar documento");
      onDocumentsChange(documents.filter((it) => it.id !== docId));
      toast.success("Documento eliminado");
    } catch (error) { console.error(error); toast.error("No se pudo eliminar documento"); }
    finally { setDeletingDocId(null); setConfirmDeleteId(null); }
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
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-xs w-[120px]"
            value={docForm.folderId ?? ""}
            onChange={(e) => setDocForm((prev) => ({ ...prev, folderId: e.target.value || null }))}
          >
            <option value="">Sin carpeta</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
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

      {/* Folder management */}
      {canManageDocs && (
        <div className="flex items-center gap-2 mb-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCreatingFolder(true)}>
            <FolderPlus className="h-3.5 w-3.5 mr-1" />
            Nueva carpeta
          </Button>
          {creatingFolder && (
            <div className="flex items-center gap-1">
              <Input
                className="h-7 w-32 text-xs"
                placeholder="Nombre"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setCreatingFolder(false); }}
              />
              <Button size="sm" className="h-7 text-xs" onClick={() => handleCreateFolder()}>Crear</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingFolder(false)}>Cancelar</Button>
            </div>
          )}
        </div>
      )}

      {/* Compact document list */}
      {documents.length === 0 ? (
        <p className="text-xs text-[#7a8a9e] py-1">Sin documentos cargados.</p>
      ) : (
        <div className="rounded-lg border border-[#1a2332] divide-y divide-[#1a2332]">
          {(() => {
            const rootDocs = documents.filter((d) => !d.folderId);
            const docsByFolder = documents.reduce((acc, d) => {
              const key = d.folderId ?? "__root__";
              if (!acc[key]) acc[key] = [];
              acc[key].push(d);
              return acc;
            }, {} as Record<string, GuardiaDocument[]>);
            const rootFolders = folders.filter((f) => !f.parentId);
            const renderDocRow = (doc: GuardiaDocument) => {
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
                  <div className="flex items-center gap-1 shrink-0">
                    {canManageDocs && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", doc.portalVisible && "text-emerald-400")}
                        title={doc.portalVisible ? "Visible en portal" : "Oculto del portal"}
                        onClick={() => handleTogglePortalVisible(doc)}
                      >
                        {doc.portalVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-[#7a8a9e]" />}
                      </Button>
                    )}
                    {doc.fileUrl ? (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver documento" onClick={() => setPreviewDoc(doc)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={`${doc.fileUrl}?download=true`} download={DOC_LABEL[doc.type] || doc.type} title="Descargar">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </>
                    ) : (
                      <span className="text-[11px] text-[#4a5568] shrink-0">Sin archivo</span>
                    )}
                    {canManageDocs && (
                      <>
                        <ConfirmDialog
                          open={confirmDeleteId === doc.id}
                          onOpenChange={(open) => setConfirmDeleteId(open ? doc.id : null)}
                          title="Eliminar documento"
                          description={`¿Eliminar "${DOC_LABEL[doc.type] || doc.type}"?`}
                          onConfirm={() => handleDeleteDocument(doc.id)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          title="Eliminar"
                          onClick={() => setConfirmDeleteId(doc.id)}
                          disabled={deletingDocId === doc.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            };
            return (
              <>
                {rootDocs.map((doc) => renderDocRow(doc))}
                {rootFolders.map((folder) => {
                  const folderDocs = docsByFolder[folder.id] ?? [];
                  const isExpanded = expandedFolders.has(folder.id);
                  return (
                    <div key={folder.id}>
                      <div
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 hover:bg-[#111822]/50 cursor-pointer",
                          renamingFolderId === folder.id && "py-1"
                        )}
                        onClick={() => setExpandedFolders((prev) => {
                          const next = new Set(prev);
                          if (next.has(folder.id)) next.delete(folder.id);
                          else next.add(folder.id);
                          return next;
                        })}
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-[#7a8a9e]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#7a8a9e]" />}
                        {renamingFolderId === folder.id ? (
                          <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                            <Input className="h-6 text-xs flex-1" value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") setRenamingFolderId(null); }} autoFocus />
                            <Button size="sm" className="h-6 text-xs" onClick={() => handleRenameFolder(folder.id)}>OK</Button>
                          </div>
                        ) : (
                          <>
                            <Folder className="h-3.5 w-3.5 text-[#7a8a9e]" />
                            <span className="text-sm flex-1 truncate">{folder.name}</span>
                            {canManageDocs && (
                              <>
                                <Button variant="ghost" size="icon" className={cn("h-6 w-6", folder.portalVisible && "text-emerald-400")}
                                  title={folder.portalVisible ? "Visible en portal" : "Oculta del portal"}
                                  onClick={(e) => { e.stopPropagation(); handleToggleFolderPortalVisible(folder); }}>
                                  {folder.portalVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-[#7a8a9e]" />}
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setRenamingFolderId(folder.id); setRenameValue(folder.name); }}>Renombrar</DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm(`¿Eliminar carpeta "${folder.name}"?`)) handleDeleteFolder(folder.id); }}>Eliminar</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
                          </>
                        )}
                      </div>
                      {isExpanded && folderDocs.map((doc) => renderDocRow(doc))}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      <p className="text-[11px] text-[#4a5568]">{documents.length} documento(s)</p>

      {/* ── Fullscreen preview modal ── */}
      {previewDoc?.fileUrl && (
        <FilePreviewModal
          open={!!previewDoc}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          url={previewDoc.fileUrl}
          fileName={DOC_LABEL[previewDoc.type] || previewDoc.type}
          mimeType={previewDoc.fileUrl.endsWith(".pdf") ? "application/pdf" : previewDoc.fileUrl.match(/\.(jpe?g|png|gif|webp)$/i) ? `image/${(previewDoc.fileUrl.match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || "jpeg").replace("jpg", "jpeg")}` : ""}
        />
      )}
    </div>
  );
}
