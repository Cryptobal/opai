"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  FileText,
  Loader2,
  ExternalLink,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  Pencil,
  Plus,
  Building2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocStatusBadge } from "@/components/ops/DocStatusBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ── Types ── */

type TipoDoc = {
  id: string;
  codigo: string;
  nombre: string;
  normativa: string | null;
  obligatorio: boolean;
  tieneVencimiento: boolean;
  diasAlerta: number;
  order: number;
  capa: string;
  documentoActual: { id: string; status: string; fileName: string; expiresAt: string | null } | null;
};

type DocGlobal = {
  id: string;
  tipoId: string;
  tipo: TipoDoc;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: string;
  notes: string | null;
  portalClienteVisible: boolean;
  createdAt: string;
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Main Component ── */

type Tab = "empresa" | "guardias";

export function GlobalDocumentsClient() {
  const [activeTab, setActiveTab] = useState<Tab>("empresa");
  const [tiposEmpresa, setTiposEmpresa] = useState<TipoDoc[]>([]);
  const [tiposGuardia, setTiposGuardia] = useState<TipoDoc[]>([]);
  const [documents, setDocuments] = useState<DocGlobal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [tiposRes, docsRes] = await Promise.all([
        fetch("/api/operacional/tipos"),
        fetch("/api/operacional/documentos-globales"),
      ]);
      const [tiposJson, docsJson] = await Promise.all([tiposRes.json(), docsRes.json()]);
      if (tiposJson.success) {
        const all: TipoDoc[] = tiposJson.data;
        setTiposEmpresa(all.filter((t) => t.capa === "global"));
        setTiposGuardia(all.filter((t) => t.capa === "guardia"));
      }
      if (docsJson.success) setDocuments(docsJson.data);
    } catch {
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
        {([
          { id: "empresa" as Tab, label: "Empresa", icon: Building2 },
          { id: "guardias" as Tab, label: "Guardias", icon: User },
        ]).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "empresa" && (
        <EmpresaTab
          tipos={tiposEmpresa}
          documents={documents}
          onRefresh={fetchData}
        />
      )}
      {activeTab === "guardias" && (
        <GuardiaTiposTab
          tipos={tiposGuardia}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   TAB: EMPRESA — Documentos globales + checklist
   ══════════════════════════════════════════════════ */

function EmpresaTab({
  tipos,
  documents,
  onRefresh,
}: {
  tipos: TipoDoc[];
  documents: DocGlobal[];
  onRefresh: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [uploadModal, setUploadModal] = useState<{ tipoId: string; tipoNombre: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadForm, setUploadForm] = useState({ issuedAt: "", expiresAt: "", notes: "", customNombre: "", tieneVencimiento: true });

  // Tipo editing
  const [editTipo, setEditTipo] = useState<TipoDoc | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", normativa: "", obligatorio: false });
  const [deleteTipoId, setDeleteTipoId] = useState<string | null>(null);
  const [addTipoOpen, setAddTipoOpen] = useState(false);
  const [addTipoForm, setAddTipoForm] = useState({ nombre: "", normativa: "", obligatorio: false, tieneVencimiento: true });

  const resetUpload = () => {
    setUploadModal(null);
    setUploadFile(null);
    setUploadForm({ issuedAt: "", expiresAt: "", notes: "", customNombre: "", tieneVencimiento: true });
  };

  const handleUpload = async () => {
    if (!uploadModal || !uploadFile) return;
    const isCustom = uploadModal.tipoId === "__nuevo__";
    if (isCustom && !uploadForm.customNombre.trim()) {
      toast.error("Ingresa un nombre para el documento");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      if (isCustom) {
        formData.append("customNombre", uploadForm.customNombre.trim());
        formData.append("tieneVencimiento", String(uploadForm.tieneVencimiento));
      } else {
        formData.append("tipoId", uploadModal.tipoId);
      }
      if (uploadForm.issuedAt) formData.append("issuedAt", uploadForm.issuedAt);
      if (uploadForm.expiresAt) formData.append("expiresAt", uploadForm.expiresAt);
      if (uploadForm.notes) formData.append("notes", uploadForm.notes);

      const res = await fetch("/api/operacional/documentos-globales", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Documento subido");
      resetUpload();
      await onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      const res = await fetch(`/api/operacional/documentos-globales/${docId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) { toast.success("Documento eliminado"); await onRefresh(); }
      else toast.error(json.error || "Error al eliminar");
    } catch { toast.error("Error al eliminar"); }
    finally { setDeleteDocId(null); }
  };

  const handleEditTipo = async () => {
    if (!editTipo) return;
    try {
      const res = await fetch(`/api/operacional/tipos/${editTipo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: editForm.nombre, normativa: editForm.normativa || null, obligatorio: editForm.obligatorio }),
      });
      const json = await res.json();
      if (json.success) { toast.success("Tipo actualizado"); setEditTipo(null); await onRefresh(); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error al actualizar"); }
  };

  const handleDeleteTipo = async (id: string) => {
    try {
      const res = await fetch(`/api/operacional/tipos/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) { toast.success("Tipo eliminado"); await onRefresh(); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error al eliminar"); }
    finally { setDeleteTipoId(null); }
  };

  const handleAddTipo = async () => {
    if (!addTipoForm.nombre.trim()) { toast.error("Nombre requerido"); return; }
    try {
      const res = await fetch("/api/operacional/tipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addTipoForm, capa: "global" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Tipo creado");
        setAddTipoOpen(false);
        setAddTipoForm({ nombre: "", normativa: "", obligatorio: false, tieneVencimiento: true });
        await onRefresh();
      } else toast.error(json.error || "Error");
    } catch { toast.error("Error al crear"); }
  };

  // Score
  const obligatorios = tipos.filter((t) => t.obligatorio);
  const vigentes = obligatorios.filter((t) => {
    const doc = documents.find((d) => d.tipoId === t.id);
    return doc && (doc.status === "vigente" || doc.status === "no_aplica");
  }).length;

  return (
    <>
      {/* Score */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Cumplimiento: {vigentes}/{obligatorios.length} documentos vigentes</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {documents.filter((d) => d.status === "por_vencer").length > 0 && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> {documents.filter((d) => d.status === "por_vencer").length} por vencer
                  </span>
                )}
                {obligatorios.length - vigentes > 0 && (
                  <span className="flex items-center gap-1 text-zinc-500">
                    <Circle className="h-3 w-3" /> {obligatorios.length - vigentes} sin documento
                  </span>
                )}
              </div>
            </div>
            <p className="text-2xl font-bold">{obligatorios.length > 0 ? Math.round((vigentes / obligatorios.length) * 100) : 100}%</p>
          </div>
          <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${obligatorios.length > 0 ? (vigentes / obligatorios.length) * 100 : 100}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Tipos de documentos de empresa. Haz clic en el lápiz para editar.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setAddTipoOpen(true); setAddTipoForm({ nombre: "", normativa: "", obligatorio: false, tieneVencimiento: true }); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo tipo
          </Button>
          <Button size="sm" onClick={() => {
            setUploadModal({ tipoId: "__nuevo__", tipoNombre: "Nuevo documento" });
            setUploadFile(null);
            setUploadForm({ issuedAt: "", expiresAt: "", notes: "", customNombre: "", tieneVencimiento: true });
          }}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Cargar documento
          </Button>
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {tipos.map((tipo) => {
          const doc = documents.find((d) => d.tipoId === tipo.id);
          return (
            <Card key={tipo.id}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className="shrink-0">
                  {doc ? (
                    doc.status === "vigente" || doc.status === "no_aplica"
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      : doc.status === "por_vencer"
                        ? <AlertTriangle className="h-5 w-5 text-amber-400" />
                        : <XCircle className="h-5 w-5 text-red-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{tipo.nombre}</p>
                    {!tipo.obligatorio && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Opcional</Badge>}
                  </div>
                  {tipo.normativa && <p className="text-xs text-muted-foreground truncate">{tipo.normativa}</p>}
                  {doc && (
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      <span className="truncate">{doc.fileName}</span>
                      <span>·</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      {doc.expiresAt && (
                        <><span>·</span><span>Vence: {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC" }).format(new Date(doc.expiresAt))}</span></>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0">{doc ? <DocStatusBadge status={doc.status} expiresAt={doc.expiresAt} /> : <DocStatusBadge status="sin_documento" />}</div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditTipo(tipo); setEditForm({ nombre: tipo.nombre, normativa: tipo.normativa || "", obligatorio: tipo.obligatorio }); }} title="Editar tipo">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {doc?.fileUrl && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(doc.fileUrl, "_blank")} title="Ver PDF">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {doc ? (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => setDeleteDocId(doc.id)} title="Eliminar documento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => { setUploadModal({ tipoId: tipo.id, tipoNombre: tipo.nombre }); setUploadFile(null); setUploadForm({ issuedAt: "", expiresAt: "", notes: "", customNombre: "", tieneVencimiento: true }); }}>
                      <Upload className="h-3.5 w-3.5 mr-1.5" /> Cargar
                    </Button>
                  )}
                  {!doc && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => setDeleteTipoId(tipo.id)} title="Eliminar tipo">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Upload Modal */}
      <UploadDocModal
        open={!!uploadModal}
        onClose={resetUpload}
        tipoId={uploadModal?.tipoId ?? ""}
        tipoNombre={uploadModal?.tipoNombre ?? ""}
        tipos={tipos}
        documents={documents}
        uploadFile={uploadFile}
        setUploadFile={setUploadFile}
        uploadForm={uploadForm}
        setUploadForm={setUploadForm}
        uploading={uploading}
        onUpload={handleUpload}
        onSelectTipo={(id, nombre) => setUploadModal({ tipoId: id, tipoNombre: nombre })}
      />

      {/* Edit Tipo Modal */}
      <Dialog open={!!editTipo} onOpenChange={(open) => !open && setEditTipo(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Editar tipo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input value={editForm.nombre} onChange={(e) => setEditForm((p) => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Normativa (opcional)</Label>
              <Input value={editForm.normativa} onChange={(e) => setEditForm((p) => ({ ...p, normativa: e.target.value }))} placeholder="Ej: D.S. 93 Art.13" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit-obligatorio" checked={editForm.obligatorio} onChange={(e) => setEditForm((p) => ({ ...p, obligatorio: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="edit-obligatorio" className="text-xs cursor-pointer">Obligatorio para fiscalización</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTipo(null)}>Cancelar</Button>
            <Button onClick={handleEditTipo}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Tipo Modal */}
      <Dialog open={addTipoOpen} onOpenChange={setAddTipoOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nuevo tipo de documento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input value={addTipoForm.nombre} onChange={(e) => setAddTipoForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Póliza de accidentes" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Normativa (opcional)</Label>
              <Input value={addTipoForm.normativa} onChange={(e) => setAddTipoForm((p) => ({ ...p, normativa: e.target.value }))} placeholder="Ej: D.S. 93 Art.13" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="add-obligatorio" checked={addTipoForm.obligatorio} onChange={(e) => setAddTipoForm((p) => ({ ...p, obligatorio: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="add-obligatorio" className="text-xs cursor-pointer">Obligatorio para fiscalización</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="add-vencimiento" checked={addTipoForm.tieneVencimiento} onChange={(e) => setAddTipoForm((p) => ({ ...p, tieneVencimiento: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="add-vencimiento" className="text-xs cursor-pointer">Tiene fecha de vencimiento</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTipoOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddTipo}>Crear tipo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete doc confirm */}
      <ConfirmDialog open={!!deleteDocId} onOpenChange={(open) => !open && setDeleteDocId(null)} title="Eliminar documento" description="El documento será eliminado permanentemente." confirmLabel="Eliminar" onConfirm={() => { if (deleteDocId) handleDeleteDoc(deleteDocId); }} />

      {/* Delete tipo confirm */}
      <ConfirmDialog open={!!deleteTipoId} onOpenChange={(open) => !open && setDeleteTipoId(null)} title="Eliminar tipo de documento" description="Se eliminará este tipo del catálogo. Solo posible si no tiene documentos asociados." confirmLabel="Eliminar" onConfirm={() => { if (deleteTipoId) handleDeleteTipo(deleteTipoId); }} />
    </>
  );
}

/* ══════════════════════════════════════════════════
   TAB: GUARDIAS — Tipos de docs requeridos por guardia
   ══════════════════════════════════════════════════ */

function GuardiaTiposTab({
  tipos,
  onRefresh,
}: {
  tipos: TipoDoc[];
  onRefresh: () => Promise<void>;
}) {
  const [editTipo, setEditTipo] = useState<TipoDoc | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", normativa: "", obligatorio: false, tieneVencimiento: true, diasAlerta: 30 });
  const [deleteTipoId, setDeleteTipoId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ nombre: "", normativa: "", obligatorio: true, tieneVencimiento: true, diasAlerta: 30 });

  const handleEdit = async () => {
    if (!editTipo) return;
    try {
      const res = await fetch(`/api/operacional/tipos/${editTipo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (json.success) { toast.success("Tipo actualizado"); setEditTipo(null); await onRefresh(); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error al actualizar"); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/operacional/tipos/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) { toast.success("Tipo eliminado"); await onRefresh(); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error al eliminar"); }
    finally { setDeleteTipoId(null); }
  };

  const handleAdd = async () => {
    if (!addForm.nombre.trim()) { toast.error("Nombre requerido"); return; }
    try {
      const res = await fetch("/api/operacional/tipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, capa: "guardia" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Tipo creado");
        setAddOpen(false);
        setAddForm({ nombre: "", normativa: "", obligatorio: true, tieneVencimiento: true, diasAlerta: 30 });
        await onRefresh();
      } else toast.error(json.error || "Error");
    } catch { toast.error("Error al crear"); }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Documentos requeridos por guardia</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define qué documentos debe tener cada guardia. Estos tipos aparecen en la ficha de cada guardia para cargar sus PDFs.
          </p>
        </div>
        <Button size="sm" onClick={() => { setAddOpen(true); setAddForm({ nombre: "", normativa: "", obligatorio: true, tieneVencimiento: true, diasAlerta: 30 }); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo tipo
        </Button>
      </div>

      <div className="space-y-2">
        {tipos.length === 0 ? (
          <Card><CardContent className="py-8 text-center"><p className="text-sm text-muted-foreground">No hay tipos de documentos de guardia configurados.</p></CardContent></Card>
        ) : tipos.map((tipo) => (
          <Card key={tipo.id}>
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{tipo.nombre}</p>
                  {tipo.obligatorio && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-blue-500/15 text-blue-400 border-blue-500/30">Obligatorio</Badge>}
                  {!tipo.obligatorio && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Opcional</Badge>}
                  {tipo.tieneVencimiento && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Vence</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {tipo.normativa && <span>{tipo.normativa}</span>}
                  {tipo.tieneVencimiento && <span>Alerta: {tipo.diasAlerta} días antes</span>}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                  setEditTipo(tipo);
                  setEditForm({ nombre: tipo.nombre, normativa: tipo.normativa || "", obligatorio: tipo.obligatorio, tieneVencimiento: tipo.tieneVencimiento, diasAlerta: tipo.diasAlerta });
                }} title="Editar">
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => setDeleteTipoId(tipo.id)} title="Eliminar">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit modal */}
      <Dialog open={!!editTipo} onOpenChange={(open) => !open && setEditTipo(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Editar tipo de documento guardia</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input value={editForm.nombre} onChange={(e) => setEditForm((p) => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Normativa (opcional)</Label>
              <Input value={editForm.normativa} onChange={(e) => setEditForm((p) => ({ ...p, normativa: e.target.value }))} placeholder="Ej: D.S. 867 Art.5 N°4" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="guardia-obligatorio" checked={editForm.obligatorio} onChange={(e) => setEditForm((p) => ({ ...p, obligatorio: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="guardia-obligatorio" className="text-xs cursor-pointer">Obligatorio</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="guardia-vencimiento" checked={editForm.tieneVencimiento} onChange={(e) => setEditForm((p) => ({ ...p, tieneVencimiento: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="guardia-vencimiento" className="text-xs cursor-pointer">Tiene vencimiento</Label>
            </div>
            {editForm.tieneVencimiento && (
              <div className="space-y-1.5">
                <Label className="text-xs">Días de alerta antes del vencimiento</Label>
                <Input type="number" min={0} value={editForm.diasAlerta} onChange={(e) => setEditForm((p) => ({ ...p, diasAlerta: parseInt(e.target.value) || 0 }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTipo(null)}>Cancelar</Button>
            <Button onClick={handleEdit}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nuevo tipo de documento guardia</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input value={addForm.nombre} onChange={(e) => setAddForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Licencia de conducir" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Normativa (opcional)</Label>
              <Input value={addForm.normativa} onChange={(e) => setAddForm((p) => ({ ...p, normativa: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="add-g-obligatorio" checked={addForm.obligatorio} onChange={(e) => setAddForm((p) => ({ ...p, obligatorio: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="add-g-obligatorio" className="text-xs cursor-pointer">Obligatorio</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="add-g-vencimiento" checked={addForm.tieneVencimiento} onChange={(e) => setAddForm((p) => ({ ...p, tieneVencimiento: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="add-g-vencimiento" className="text-xs cursor-pointer">Tiene vencimiento</Label>
            </div>
            {addForm.tieneVencimiento && (
              <div className="space-y-1.5">
                <Label className="text-xs">Días de alerta</Label>
                <Input type="number" min={0} value={addForm.diasAlerta} onChange={(e) => setAddForm((p) => ({ ...p, diasAlerta: parseInt(e.target.value) || 0 }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Crear tipo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTipoId} onOpenChange={(open) => !open && setDeleteTipoId(null)} title="Eliminar tipo" description="Se eliminará este tipo del catálogo. Solo posible si no tiene documentos asociados." confirmLabel="Eliminar" onConfirm={() => { if (deleteTipoId) handleDelete(deleteTipoId); }} />
    </>
  );
}

/* ══════════════════════════════════════════════════
   Upload Modal (shared)
   ══════════════════════════════════════════════════ */

function UploadDocModal({
  open, onClose, tipoId, tipoNombre, tipos, documents,
  uploadFile, setUploadFile, uploadForm, setUploadForm,
  uploading, onUpload, onSelectTipo,
}: {
  open: boolean;
  onClose: () => void;
  tipoId: string;
  tipoNombre: string;
  tipos: TipoDoc[];
  documents: DocGlobal[];
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  uploadForm: { issuedAt: string; expiresAt: string; notes: string; customNombre: string; tieneVencimiento: boolean };
  setUploadForm: React.Dispatch<React.SetStateAction<typeof uploadForm>>;
  uploading: boolean;
  onUpload: () => void;
  onSelectTipo: (id: string, nombre: string) => void;
}) {
  const isCustom = tipoId === "__nuevo__";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isCustom ? "Cargar nuevo documento" : `Cargar: ${tipoNombre}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isCustom && (
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre del documento</Label>
              <Input
                value={uploadForm.customNombre}
                onChange={(e) => setUploadForm((p) => ({ ...p, customNombre: e.target.value }))}
                placeholder="Ej: Póliza de accidentes, Certificado municipal..."
              />
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="upload-vencimiento" checked={uploadForm.tieneVencimiento} onChange={(e) => setUploadForm((p) => ({ ...p, tieneVencimiento: e.target.checked }))} className="rounded border-border" />
                <Label htmlFor="upload-vencimiento" className="text-xs cursor-pointer">Tiene fecha de vencimiento</Label>
              </div>
            </div>
          )}

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") setUploadFile(f); else toast.error("Solo PDF"); }}
            className="relative rounded-lg border-2 border-dashed p-6 text-center border-border hover:border-muted-foreground/40 transition-colors"
          >
            <input type="file" accept=".pdf" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); e.target.value = ""; }} />
            {uploadFile ? (
              <div className="flex items-center gap-2 justify-center">
                <FileText className="h-5 w-5 text-red-400" />
                <span className="text-sm font-medium truncate">{uploadFile.name}</span>
                <Badge variant="secondary">{formatFileSize(uploadFile.size)}</Badge>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <FileUp className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm">Arrastra un PDF o haz clic</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha emisión</Label>
              <Input type="date" value={uploadForm.issuedAt} onChange={(e) => setUploadForm((p) => ({ ...p, issuedAt: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha vencimiento</Label>
              <Input type="date" value={uploadForm.expiresAt} onChange={(e) => setUploadForm((p) => ({ ...p, expiresAt: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas (opcional)</Label>
            <Input value={uploadForm.notes} onChange={(e) => setUploadForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Observaciones..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onUpload} disabled={!uploadFile || uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Subir documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
