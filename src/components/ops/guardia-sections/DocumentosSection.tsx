"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  Circle,
  Clock,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  Folder,
  FolderInput,
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Globe,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DOCUMENT_TYPES, getDocLabel } from "@/lib/personas";
import { calcDocStatus, DOC_STATUS_LABELS } from "@/lib/docs-operacionales";
import type { OperationalGuardDocSlot } from "@/lib/operational-guard-doc-slots-shared";
import { pickPersonaTypeForSlot } from "@/lib/operational-guard-doc-slots-shared";
import type { GuardiaDocumentoConfigItem } from "@/lib/guardia-documentos-config";
import { cn } from "@/lib/utils";
import { FilePreviewModal } from "@/components/ui/FilePreviewModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

type GuardiaDocConfigItem = GuardiaDocumentoConfigItem;

interface DocumentosSectionProps {
  guardiaId: string;
  documents: GuardiaDocument[];
  canManageDocs: boolean;
  guardiaDocConfig: GuardiaDocConfigItem[];
  /** Checklist alineado con documentos operacionales por guardia (instalación OS10) */
  operationalSlots?: OperationalGuardDocSlot[];
  /** Labels configurados (code → label) desde la configuración de Operaciones */
  docLabels?: Record<string, string>;
  onDocumentsChange: (documents: GuardiaDocument[]) => void;
}

function pickDocForSlot(docs: GuardiaDocument[], personaTypes: string[]): GuardiaDocument | null {
  const candidates = docs.filter((d) => personaTypes.includes(d.type));
  if (candidates.length === 0) return null;
  const rootFirst = candidates.filter((d) => !d.folderId);
  const pool = rootFirst.length > 0 ? rootFirst : candidates;
  return [...pool].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function formatExpiration(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const d = new Date(expiresAt);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function toDateInput(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const d = new Date(expiresAt);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DocumentosSection({
  guardiaId,
  documents,
  canManageDocs,
  guardiaDocConfig,
  operationalSlots = [],
  docLabels = {},
  onDocumentsChange,
}: DocumentosSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; portalVisible: boolean; parentId?: string | null }>>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<GuardiaDocument | null>(null);
  const slotFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingSlotCode, setPendingSlotCode] = useState<string | null>(null);
  const [uploadingSlotCodigo, setUploadingSlotCodigo] = useState<string | null>(null);
  const [expiryDraftByDocId, setExpiryDraftByDocId] = useState<Record<string, string>>({});
  const [dragOverCode, setDragOverCode] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Nuevo: formulario para subir tipo arbitrario (fuera del checklist)
  const [extraUploadType, setExtraUploadType] = useState<string>(DOCUMENT_TYPES[0]);
  const [extraUploadFolderId, setExtraUploadFolderId] = useState<string | null>(null);
  const [extraExpiresAt, setExtraExpiresAt] = useState("");
  const [extraFileUrl, setExtraFileUrl] = useState("");
  const [creatingDoc, setCreatingDoc] = useState(false);
  const extraFileInputRef = useRef<HTMLInputElement | null>(null);
  const extraExpiresAtRef = useRef<HTMLInputElement | null>(null);

  /** Resolver label: usa docLabels configurados, luego fallback a getDocLabel. */
  const label = useCallback(
    (code: string) => getDocLabel(code, docLabels),
    [docLabels],
  );

  const hasExpirationByType = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of guardiaDocConfig) map.set(c.code, c.hasExpiration);
    return map;
  }, [guardiaDocConfig]);

  // ── Unified slot list: operational slots + remaining config doc types ──
  // Construye un checklist unificado con TODOS los tipos de doc
  const unifiedSlots = useMemo(() => {
    type UnifiedSlot = {
      code: string; // código principal (para matching con docs)
      label: string;
      normativa: string | null;
      obligatorio: boolean;
      tieneVencimiento: boolean;
      diasAlerta: number;
      personaTypes: string[]; // tipos de OpsDocumentoPersona que cuentan para este slot
      isOperational: boolean;
    };

    const slots: UnifiedSlot[] = [];
    const seenCodes = new Set<string>();

    // 1. Primero slots operacionales (OS10)
    for (const slot of operationalSlots) {
      slots.push({
        code: slot.codigo,
        label: label(slot.personaTypes[0] ?? slot.codigo),
        normativa: slot.normativa,
        obligatorio: slot.obligatorio,
        tieneVencimiento: slot.tieneVencimiento,
        diasAlerta: slot.diasAlerta,
        personaTypes: slot.personaTypes,
        isOperational: true,
      });
      for (const pt of slot.personaTypes) seenCodes.add(pt);
      seenCodes.add(slot.codigo);
    }

    // 2. Luego los doc types del config que no están cubiertos por slots operacionales
    for (const dt of DOCUMENT_TYPES) {
      if (seenCodes.has(dt)) continue;
      const cfg = guardiaDocConfig.find((c) => c.code === dt);
      slots.push({
        code: dt,
        label: label(dt),
        normativa: null,
        obligatorio: false,
        tieneVencimiento: cfg?.hasExpiration ?? false,
        diasAlerta: cfg?.alertDaysBefore ?? 30,
        personaTypes: [dt],
        isOperational: false,
      });
      seenCodes.add(dt);
    }

    return slots;
  }, [operationalSlots, guardiaDocConfig, label]);

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

  // ── Handlers ──

  const handleSlotUpload = async (slotCode: string, personaTypes: string[], file?: File | null) => {
    if (!file) return;
    const type = pickPersonaTypeForSlot(personaTypes);
    if (!type) {
      toast.error("Tipo de documento no configurado");
      return;
    }
    setUploadingSlotCodigo(slotCode);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/personas/guardias/upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo subir el archivo");
      const fileUrl = payload.data.url as string;
      const resDoc = await fetch(`/api/personas/guardias/${guardiaId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, status: "pendiente", fileUrl, issuedAt: null, expiresAt: null, folderId: null, portalVisible: false }),
      });
      const docPayload = await resDoc.json();
      if (!resDoc.ok || !docPayload.success) throw new Error(docPayload.error || "No se pudo registrar el documento");
      onDocumentsChange([docPayload.data, ...documents]);
      toast.success(`${label(type)} cargado`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el documento");
    } finally {
      setUploadingSlotCodigo(null);
    }
  };

  const handleExtraUpload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/personas/guardias/upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo subir el archivo");
      setExtraFileUrl(payload.data.url);
      toast.success("Archivo subido");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo subir archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateExtraDocument = async () => {
    if (!extraFileUrl) { toast.error("Primero sube un archivo"); return; }
    setCreatingDoc(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardiaId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: extraUploadType,
          status: "pendiente",
          fileUrl: extraFileUrl,
          issuedAt: null,
          expiresAt: hasExpirationByType.get(extraUploadType) ? (extraExpiresAt || null) : null,
          folderId: extraUploadFolderId || null,
          portalVisible: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo crear documento");
      onDocumentsChange([payload.data, ...documents]);
      setExtraUploadType(DOCUMENT_TYPES[0]);
      setExtraExpiresAt("");
      setExtraFileUrl("");
      setExtraUploadFolderId(null);
      toast.success("Documento agregado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear documento");
    } finally {
      setCreatingDoc(false);
    }
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), entityType: "guardia", entityId: guardiaId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) => [...prev, data.data]);
      setNewFolderName("");
      setCreatingFolder(false);
      toast.success("Carpeta creada");
    } catch {
      toast.error("Error al crear carpeta");
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/crm/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name: data.data.name } : f)));
      onDocumentsChange(documents.map((d) => (d.folderId === folderId && d.folder) ? { ...d, folder: { ...d.folder, name: data.data.name } } : d));
      setRenamingFolderId(null);
      setRenameValue("");
      toast.success("Carpeta renombrada");
    } catch { toast.error("Error al renombrar"); }
  };

  const handleMoveToFolder = async (docId: string, folderId: string | null) => {
    try {
      const res = await fetch(
        `/api/personas/guardias/${guardiaId}/documents?documentId=${encodeURIComponent(docId)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId }) }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      const folderObj = folderId ? folders.find((f) => f.id === folderId) : null;
      onDocumentsChange(documents.map((d) =>
        d.id === docId ? { ...d, folderId, folder: folderObj ? { id: folderObj.id, name: folderObj.name, portalVisible: folderObj.portalVisible } : null } : d
      ));
      toast.success(folderId ? `Movido a "${folderObj?.name}"` : "Movido fuera de carpeta");
    } catch { toast.error("Error al mover documento"); }
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalVisible: !folder.portalVisible }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, portalVisible: data.data.portalVisible } : f)));
      toast.success(folder.portalVisible ? "Carpeta oculta del portal" : "Carpeta visible en portal");
    } catch { toast.error("Error al actualizar visibilidad"); }
  };

  const handleSaveDocument = async (doc: GuardiaDocument, expiresAt?: string): Promise<boolean> => {
    setSavingDocId(doc.id);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardiaId}/documents?documentId=${encodeURIComponent(doc.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
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
      return true;
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar documento");
      return false;
    } finally {
      setSavingDocId(null);
    }
  };

  const handleSaveExpiry = async (doc: GuardiaDocument) => {
    if (!hasExpirationByType.get(doc.type)) return;
    const draft = expiryDraftByDocId[doc.id];
    const raw = draft !== undefined && draft !== "" ? draft : toDateInput(doc.expiresAt);
    if (!raw) {
      toast.error("Indica la fecha de vencimiento");
      return;
    }
    const ok = await handleSaveDocument(doc, raw);
    if (ok) {
      setExpiryDraftByDocId((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
    }
  };

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
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar documento");
    } finally {
      setDeletingDocId(null);
      setConfirmDeleteId(null);
    }
  };

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

  // ── Status helpers ──

  function getStatusInfo(doc: GuardiaDocument | null, tieneVencimiento: boolean, diasAlerta: number) {
    if (!doc?.fileUrl) {
      return { icon: <Circle className="h-4 w-4 text-zinc-600" />, label: "Sin documento", color: "text-zinc-500" };
    }
    const st = calcDocStatus(doc.expiresAt ? new Date(doc.expiresAt) : null, tieneVencimiento, diasAlerta);
    if (st === "vencido") return { icon: <X className="h-4 w-4 text-status-danger-fg" />, label: DOC_STATUS_LABELS[st], color: "text-status-danger-fg" };
    if (st === "por_vencer") return { icon: <Clock className="h-4 w-4 text-status-warn-fg" />, label: DOC_STATUS_LABELS[st], color: "text-status-warn-fg" };
    return { icon: <Check className="h-4 w-4 text-status-ok-fg" />, label: DOC_STATUS_LABELS[st] ?? "Vigente", color: "text-status-ok-fg" };
  }

  // ── Render ──

  return (
    <div className="space-y-4">
      {expiringDocs.length > 0 && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-4 py-2.5 text-xs text-status-warn-fg">
          {expiringDocs.length} documento(s) vencido(s) o por vencer
        </div>
      )}

      {/* Hidden file input for slot uploads */}
      <input
        ref={slotFileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const code = pendingSlotCode;
          e.target.value = "";
          setPendingSlotCode(null);
          if (code && file) {
            const slot = unifiedSlots.find((s) => s.code === code);
            if (slot) void handleSlotUpload(code, slot.personaTypes, file);
          }
        }}
      />

      {/* ── Unified document checklist ── */}
      <div className="rounded-xl border border-border/60 bg-card/40 divide-y divide-border/40">
        <div className="px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Documentos del guardia</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Checklist unificado. Arrastra un archivo sobre cualquier fila para cargarlo.
          </p>
        </div>

        {unifiedSlots.map((slot) => {
          const doc = pickDocForSlot(documents, slot.personaTypes);
          const status = getStatusInfo(doc, slot.tieneVencimiento, slot.diasAlerta);
          const busy = uploadingSlotCodigo === slot.code;
          const isDragOver = dragOverCode === slot.code;
          const hasExpiration = slot.tieneVencimiento || (doc ? (hasExpirationByType.get(doc.type) ?? false) : false);

          return (
            <div
              key={slot.code}
              data-doc-id={doc?.id ?? `slot-${slot.code}`}
              className={cn(
                "grid grid-cols-[auto_1fr] sm:flex sm:flex-wrap sm:items-center",
                "gap-x-3 gap-y-2 px-3 py-2.5 transition-all duration-150",
                !doc?.fileUrl && "bg-zinc-950/20",
                isDragOver && "bg-primary/10 ring-1 ring-inset ring-primary/40 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragOverCode !== slot.code) setDragOverCode(slot.code);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverCode(slot.code);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCode(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverCode(null);
                if (!canManageDocs || busy) return;
                const f = e.dataTransfer.files[0];
                if (f) void handleSlotUpload(slot.code, slot.personaTypes, f);
              }}
            >
              {/* Status icon */}
              <div className="shrink-0 self-start sm:self-auto pt-0.5 sm:pt-0">{status.icon}</div>

              {/* Name + normativa + status (clic abre preview en móvil) */}
              <div className="min-w-0 sm:flex-1">
                <button
                  type="button"
                  className={cn(
                    "w-full text-left disabled:cursor-default",
                    doc?.fileUrl && "cursor-pointer hover:opacity-80 transition-opacity",
                  )}
                  disabled={!doc?.fileUrl}
                  onClick={() => doc?.fileUrl && setPreviewDoc(doc)}
                  title={doc?.fileUrl ? "Ver documento" : undefined}
                >
                  <p className="text-sm text-foreground leading-tight break-words">{slot.label}</p>
                  {slot.normativa && (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5 break-words">{slot.normativa}</p>
                  )}
                  {/* Status inline solo en móvil */}
                  <span className={cn("sm:hidden text-[11px] mt-1 inline-block font-medium", status.color)}>
                    {status.label}
                  </span>
                </button>
              </div>

              {/* Status label en desktop */}
              <span className={cn("hidden sm:inline text-[11px] shrink-0 font-medium", status.color)}>
                {status.label}
              </span>

              {/* Acciones — móvil: col-span-2 abajo; desktop: fluyen inline */}
              <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1 sm:contents">
                {/* Expiry date controls */}
                {doc?.fileUrl && hasExpiration && canManageDocs && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="date"
                      className="h-7 w-[128px] text-[11px] bg-background"
                      title="Fecha de vencimiento"
                      value={
                        doc.id && expiryDraftByDocId[doc.id] !== undefined
                          ? expiryDraftByDocId[doc.id]
                          : toDateInput(doc.expiresAt)
                      }
                      onChange={(e) =>
                        setExpiryDraftByDocId((p) => ({ ...p, [doc.id]: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-[10px] px-2"
                      disabled={busy || savingDocId === doc.id}
                      onClick={() => void handleSaveExpiry(doc)}
                    >
                      {savingDocId === doc.id ? "…" : "Guardar venc."}
                    </Button>
                  </div>
                )}

                {doc?.fileUrl && hasExpiration && !canManageDocs && doc.expiresAt && (
                  <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">
                    Vence: {formatExpiration(doc.expiresAt)}
                  </span>
                )}

                {/* Action buttons */}
                {doc?.fileUrl && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {canManageDocs && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7", doc.portalVisible && "text-status-ok-fg")}
                        title={doc.portalVisible ? "Visible en portal" : "Oculto del portal"}
                        onClick={() => handleTogglePortalVisible(doc)}
                      >
                        {doc.portalVisible ? <Globe className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver documento" onClick={() => setPreviewDoc(doc)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a href={`${doc.fileUrl}?download=true`} download={slot.label} title="Descargar">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                )}

                {/* Upload / Replace / Delete buttons */}
                {canManageDocs && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={busy}
                      onClick={() => {
                        setPendingSlotCode(slot.code);
                        queueMicrotask(() => slotFileInputRef.current?.click());
                      }}
                    >
                      {busy ? "…" : doc?.fileUrl ? "Reemplazar" : "Subir"}
                    </Button>
                    {doc?.fileUrl && (
                      <>
                        <ConfirmDialog
                          open={confirmDeleteId === doc.id}
                          onOpenChange={(open) => setConfirmDeleteId(open ? doc.id : null)}
                          title="Eliminar documento"
                          description={`¿Eliminar "${slot.label}"?`}
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Extra document upload (for additional/duplicate docs) ── */}
      <details className="group">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
          Subir documento adicional (duplicados o tipos extra)
        </summary>
        <div className="mt-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs flex-1 min-w-[140px]"
              value={extraUploadType}
              onChange={(e) => {
                const t = e.target.value;
                setExtraUploadType(t);
                if (!hasExpirationByType.get(t)) setExtraExpiresAt("");
              }}
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>{label(type)}</option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs w-[120px]"
              value={extraUploadFolderId ?? ""}
              onChange={(e) => setExtraUploadFolderId(e.target.value || null)}
            >
              <option value="">Sin carpeta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {hasExpirationByType.get(extraUploadType) && (
              <div className="flex items-center gap-1">
                <Input
                  ref={extraExpiresAtRef}
                  type="date"
                  value={extraExpiresAt}
                  onChange={(e) => setExtraExpiresAt(e.target.value)}
                  className="h-8 text-xs w-[130px]"
                />
                <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0"
                  onClick={() => extraExpiresAtRef.current?.showPicker?.()}>
                  <CalendarDays className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <input ref={extraFileInputRef} type="file" accept=".pdf,image/*" className="hidden"
              onChange={(e) => void handleExtraUpload(e.target.files?.[0])} disabled={uploading || !canManageDocs} />
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
              disabled={uploading || !canManageDocs} onClick={() => extraFileInputRef.current?.click()}>
              <FilePlus2 className="h-3.5 w-3.5 mr-1" />{uploading ? "Subiendo..." : "Archivo"}
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs"
              onClick={handleCreateExtraDocument} disabled={creatingDoc || !extraFileUrl || uploading || !canManageDocs}>
              <Upload className="h-3.5 w-3.5 mr-1" />{creatingDoc ? "..." : "Cargar"}
            </Button>
          </div>
          {extraFileUrl && <span className="text-[11px] text-status-ok-fg">Archivo listo</span>}
        </div>
      </details>

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
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") setCreatingFolder(false);
                }}
              />
              <Button size="sm" className="h-7 text-xs" onClick={() => handleCreateFolder()}>Crear</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingFolder(false)}>Cancelar</Button>
            </div>
          )}
        </div>
      )}

      {/* Documents in folders (extras not in the unified checklist) */}
      {(() => {
        // Docs claimed by unified checklist
        const claimedIds = new Set<string>();
        for (const slot of unifiedSlots) {
          const d = pickDocForSlot(documents, slot.personaTypes);
          if (d) claimedIds.add(d.id);
        }
        const extraDocs = documents.filter((d) => !claimedIds.has(d.id));
        if (extraDocs.length === 0 && folders.length === 0) return null;

        const docsByFolder = extraDocs.reduce((acc, d) => {
          const key = d.folderId ?? "__root__";
          if (!acc[key]) acc[key] = [];
          acc[key].push(d);
          return acc;
        }, {} as Record<string, GuardiaDocument[]>);

        const rootDocs = docsByFolder["__root__"] ?? [];
        const rootFolders = folders.filter((f) => !f.parentId);

        if (rootDocs.length === 0 && rootFolders.length === 0) return null;

        const renderDocRow = (doc: GuardiaDocument) => {
          const hasExpiration = hasExpirationByType.get(doc.type) ?? false;
          const expStr = hasExpiration ? formatExpiration(doc.expiresAt) : null;
          const docLabel = label(doc.type);
          return (
            <div key={doc.id} className="flex flex-wrap items-center gap-2 px-3 py-2 min-w-0 hover:bg-muted/20 transition-colors">
              {doc.fileUrl ? <Check className="h-3.5 w-3.5 text-status-ok-fg" /> : <X className="h-3.5 w-3.5 text-status-danger-fg" />}
              <span className="text-sm text-foreground truncate flex-1 min-w-0">{docLabel}</span>
              {hasExpiration && canManageDocs && (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="date"
                    className="h-7 w-[128px] text-[11px] bg-background"
                    title="Fecha de vencimiento"
                    value={expiryDraftByDocId[doc.id] !== undefined ? expiryDraftByDocId[doc.id] : toDateInput(doc.expiresAt)}
                    onChange={(e) => setExpiryDraftByDocId((p) => ({ ...p, [doc.id]: e.target.value }))}
                  />
                  <Button type="button" variant="secondary" size="sm" className="h-7 text-[10px] px-2"
                    disabled={savingDocId === doc.id} onClick={() => void handleSaveExpiry(doc)}>
                    {savingDocId === doc.id ? "…" : "Guardar venc."}
                  </Button>
                </div>
              )}
              {hasExpiration && !canManageDocs && expStr && (
                <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">Vence: {expStr}</span>
              )}
              <div className="flex items-center gap-1 shrink-0">
                {canManageDocs && (
                  <Button
                    variant="ghost" size="icon"
                    className={cn("h-7 w-7", doc.portalVisible && "text-status-ok-fg")}
                    title={doc.portalVisible ? "Visible en portal" : "Oculto del portal"}
                    onClick={() => handleTogglePortalVisible(doc)}
                  >
                    {doc.portalVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                )}
                {doc.fileUrl ? (
                  <>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver documento" onClick={() => setPreviewDoc(doc)}>
                      <Search className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a href={`${doc.fileUrl}?download=true`} download={docLabel} title="Descargar">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </>
                ) : (
                  <span className="text-[11px] text-muted-foreground/60 shrink-0">Sin archivo</span>
                )}
                {canManageDocs && (
                  <>
                    {folders.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Mover a carpeta">
                            <FolderInput className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {doc.folderId && (
                            <DropdownMenuItem onClick={() => handleMoveToFolder(doc.id, null)}>Sin carpeta</DropdownMenuItem>
                          )}
                          {folders.filter((f) => f.id !== doc.folderId).map((f) => (
                            <DropdownMenuItem key={f.id} onClick={() => handleMoveToFolder(doc.id, f.id)}>
                              <Folder className="h-3.5 w-3.5 mr-1.5" />{f.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <ConfirmDialog
                      open={confirmDeleteId === doc.id}
                      onOpenChange={(open) => setConfirmDeleteId(open ? doc.id : null)}
                      title="Eliminar documento"
                      description={`¿Eliminar "${docLabel}"?`}
                      onConfirm={() => handleDeleteDocument(doc.id)}
                    />
                    <Button
                      variant="ghost" size="icon"
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
          <div className="rounded-xl border border-border/60 bg-card/40 divide-y divide-border/40">
            <p className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Otros documentos</p>
            {rootDocs.map((doc) => renderDocRow(doc))}
            {rootFolders.map((folder) => {
              const folderDocs = docsByFolder[folder.id] ?? [];
              const isExpanded = expandedFolders.has(folder.id);
              return (
                <div key={folder.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 hover:bg-muted/20 cursor-pointer transition-colors",
                      renamingFolderId === folder.id && "py-1"
                    )}
                    onClick={() => setExpandedFolders((prev) => {
                      const next = new Set(prev);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    })}
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    {renamingFolderId === folder.id ? (
                      <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                        <Input className="h-6 text-xs flex-1" value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameFolder(folder.id); if (e.key === "Escape") setRenamingFolderId(null); }} autoFocus />
                        <Button size="sm" className="h-6 text-xs" onClick={() => handleRenameFolder(folder.id)}>OK</Button>
                      </div>
                    ) : (
                      <>
                        <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm flex-1 truncate text-foreground">{folder.name}</span>
                        {canManageDocs && (
                          <>
                            <Button variant="ghost" size="icon" className={cn("h-6 w-6", folder.portalVisible && "text-status-ok-fg")}
                              title={folder.portalVisible ? "Visible en portal" : "Oculta del portal"}
                              onClick={(e) => { e.stopPropagation(); handleToggleFolderPortalVisible(folder); }}>
                              {folder.portalVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
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
          </div>
        );
      })()}

      <p className="text-[11px] text-muted-foreground/70">{documents.length} documento(s)</p>

      {/* Fullscreen preview modal */}
      {previewDoc?.fileUrl && (
        <FilePreviewModal
          open={!!previewDoc}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          url={previewDoc.fileUrl}
          fileName={label(previewDoc.type)}
          mimeType={previewDoc.fileUrl.endsWith(".pdf") ? "application/pdf" : previewDoc.fileUrl.match(/\.(jpe?g|png|gif|webp)$/i) ? `image/${(previewDoc.fileUrl.match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || "jpeg").replace("jpg", "jpeg")}` : ""}
        />
      )}
    </div>
  );
}
