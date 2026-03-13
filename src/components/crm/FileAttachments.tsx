"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Loader2,
  Paperclip,
  Search,
  Trash2,
  Download,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileListSkeleton } from "@/components/ui/skeleton";
import { FilePreviewModal } from "@/components/ui/FilePreviewModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export type FileAttachmentItem = {
  id: string;
  linkId?: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  publicUrl: string | null;
  folderId?: string | null;
  folderName?: string | null;
  portalVisible?: boolean;
};

type DocumentFolder = {
  id: string;
  name: string;
  parentId: string | null;
  portalVisible: boolean;
};

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileAttachmentsProps {
  entityType: "lead" | "deal" | "account" | "contact" | "installation" | "guardia";
  entityId: string;
  readOnly?: boolean;
  title?: string;
  className?: string;
}

export function FileAttachments({
  entityType,
  entityId,
  readOnly = false,
  title = "Documentos",
  className,
}: FileAttachmentsProps) {
  const [files, setFiles] = useState<FileAttachmentItem[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileAttachmentItem | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/crm/files?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
      );
      const data = await res.json();
      if (data.success) setFiles(data.data);
    } catch {
      toast.error("Error al cargar archivos");
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/crm/folders?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
      );
      const data = await res.json();
      if (data.success) setFolders(data.data);
    } catch {
      /* silent */
    }
  }, [entityType, entityId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchFiles(), fetchFolders()]).finally(() => setLoading(false));
  }, [fetchFiles, fetchFolders]);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || uploading) return;
      setUploading(true);
      try {
        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          const form = new FormData();
          form.append("file", file);
          form.append("entityType", entityType);
          form.append("entityId", entityId);
          if (selectedFolderId) form.append("folderId", selectedFolderId);
          form.append("portalVisible", "false");
          const res = await fetch("/api/crm/files/upload", {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!data.success) {
            toast.error(data.error || "Error al subir archivo");
            continue;
          }
          setFiles((prev) => [
            {
              id: data.data.id,
              linkId: data.data.linkId,
              fileName: data.data.fileName,
              mimeType: data.data.mimeType,
              size: data.data.size,
              createdAt: data.data.createdAt,
              publicUrl: data.data.publicUrl ?? null,
              folderId: selectedFolderId,
              folderName: folders.find((f) => f.id === selectedFolderId)?.name ?? null,
              portalVisible: data.data.portalVisible ?? false,
            },
            ...prev,
          ]);
        }
        if (fileList.length > 0) toast.success("Archivo(s) subido(s)");
      } catch {
        toast.error("Error al subir archivo");
      } finally {
        setUploading(false);
      }
    },
    [entityType, entityId, uploading, selectedFolderId, folders]
  );

  const handleTogglePortalVisible = useCallback(
    async (file: FileAttachmentItem) => {
      try {
        const res = await fetch(`/api/crm/files/${file.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portalVisible: !file.portalVisible,
            entityType,
            entityId,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id ? { ...f, portalVisible: data.data?.portalVisible ?? !file.portalVisible } : f
          )
        );
        toast.success(file.portalVisible ? "Ocultado del portal" : "Visible en portal");
      } catch {
        toast.error("Error al actualizar visibilidad");
      }
    },
    [entityType, entityId]
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/crm/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          entityType,
          entityId,
        }),
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
  }, [entityType, entityId, newFolderName]);

  const handleRenameFolder = useCallback(async (folderId: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/crm/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name: data.data.name } : f))
      );
      setFiles((prev) =>
        prev.map((f) =>
          f.folderId === folderId ? { ...f, folderName: data.data.name } : f
        )
      );
      setRenamingFolderId(null);
      setRenameValue("");
      toast.success("Carpeta renombrada");
    } catch {
      toast.error("Error al renombrar");
    }
  }, [renameValue]);

  const handleMoveToFolder = useCallback(
    async (fileId: string, folderId: string | null) => {
      try {
        const res = await fetch(`/api/crm/files/${fileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId, entityType, entityId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        const folderName = folderId ? folders.find((f) => f.id === folderId)?.name ?? null : null;
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, folderId, folderName } : f))
        );
        toast.success(folderId ? `Movido a "${folderName}"` : "Movido fuera de carpeta");
      } catch {
        toast.error("Error al mover archivo");
      }
    },
    [entityType, entityId, folders]
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      try {
        const res = await fetch(`/api/crm/folders/${folderId}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        setFiles((prev) =>
          prev.map((f) => (f.folderId === folderId ? { ...f, folderId: null, folderName: null } : f))
        );
        toast.success("Carpeta eliminada");
      } catch {
        toast.error("Error al eliminar carpeta");
      }
    },
    []
  );

  const handleToggleFolderPortalVisible = useCallback(async (folder: DocumentFolder) => {
    try {
      const res = await fetch(`/api/crm/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalVisible: !folder.portalVisible }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setFolders((prev) =>
        prev.map((f) => (f.id === folder.id ? { ...f, portalVisible: data.data.portalVisible } : f))
      );
      toast.success(
        folder.portalVisible
          ? "Carpeta oculta del portal (documentos dentro no visibles)"
          : "Carpeta visible en portal"
      );
    } catch {
      toast.error("Error al actualizar visibilidad");
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/crm/files/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) {
          toast.error(data.error || "Error al eliminar");
          return;
        }
        setFiles((prev) => prev.filter((f) => f.id !== id));
        toast.success("Archivo eliminado");
      } catch {
        toast.error("Error al eliminar archivo");
      } finally {
        setDeleteId(null);
      }
    },
    []
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleUpload(e.dataTransfer.files);
    },
    [handleUpload]
  );

  const rootFolders = folders.filter((f) => !f.parentId);
  const filesByFolder = files.reduce(
    (acc, f) => {
      const key = f.folderId ?? "__root__";
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    },
    {} as Record<string, FileAttachmentItem[]>
  );

  const renderFileRow = (file: FileAttachmentItem) => (
    <li
      key={file.id}
      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
    >
      {IMAGE_MIMES.has(file.mimeType) && file.publicUrl ? (
        <button
          type="button"
          onClick={() => setPreviewFile(file)}
          className="shrink-0 w-10 h-10 rounded overflow-hidden border bg-muted cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow"
        >
          <img src={file.publicUrl} alt="" className="w-full h-full object-cover" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => file.publicUrl && setPreviewFile(file)}
          className={cn(
            "shrink-0 w-10 h-10 rounded flex items-center justify-center bg-muted",
            file.publicUrl && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow"
          )}
        >
          <FileText className="h-5 w-5 text-muted-foreground" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" title={file.fileName}>
          {file.fileName}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatSize(file.size)}
          {" · "}
          {new Date(file.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", file.portalVisible && "text-emerald-600")}
            title={file.portalVisible ? "Visible en portal" : "Oculto del portal"}
            onClick={() => handleTogglePortalVisible(file)}
          >
            {file.portalVisible ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
        {file.publicUrl && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Ver archivo"
              onClick={() => setPreviewFile(file)}
            >
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a
                href={`${file.publicUrl}?download=true`}
                download={file.fileName}
                title="Descargar"
              >
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </>
        )}
        {!readOnly && (
          <>
            {folders.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Mover a carpeta"
                  >
                    <FolderInput className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {file.folderId && (
                    <DropdownMenuItem onClick={() => handleMoveToFolder(file.id, null)}>
                      Sin carpeta
                    </DropdownMenuItem>
                  )}
                  {folders
                    .filter((f) => f.id !== file.folderId)
                    .map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        onClick={() => handleMoveToFolder(file.id, f.id)}
                      >
                        <Folder className="h-3.5 w-3.5 mr-1.5" />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <ConfirmDialog
              open={deleteId === file.id}
              onOpenChange={(open) => setDeleteId(open ? file.id : null)}
              title="Eliminar archivo"
              description={`¿Eliminar "${file.fileName}"?`}
              onConfirm={() => handleDelete(file.id)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              title="Eliminar"
              onClick={() => setDeleteId(file.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <>
      <Card className={cn(className)}>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            {title}
            {files.length > 0 && (
              <span className="text-[10px] font-normal text-muted-foreground">
                ({files.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <FileListSkeleton />
          ) : (
            <>
              {!readOnly && (
                <div
                  onDrop={onDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                  className={cn(
                    "mb-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50"
                  )}
                >
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    id={`file-attachments-${entityId}`}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                    onChange={(e) => {
                      handleUpload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <label
                      htmlFor={`file-attachments-${entityId}`}
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      {uploading ? (
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      ) : (
                        <Paperclip className="h-8 w-8 text-muted-foreground" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        {uploading
                          ? "Subiendo..."
                          : "Arrastra archivos aquí o haz clic para seleccionar"}
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Carpeta:</span>
                      <select
                        className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                        value={selectedFolderId ?? ""}
                        onChange={(e) => setSelectedFolderId(e.target.value || null)}
                      >
                        <option value="">Sin carpeta</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {!readOnly && (
                <div className="mb-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCreatingFolder(true)}
                  >
                    <FolderPlus className="h-3.5 w-3.5 mr-1" />
                    Nueva carpeta
                  </Button>
                  {creatingFolder && (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-7 w-40 text-xs"
                        placeholder="Nombre carpeta"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateFolder();
                          if (e.key === "Escape") setCreatingFolder(false);
                        }}
                      />
                      <Button size="sm" className="h-7 text-xs" onClick={() => handleCreateFolder()}>
                        Crear
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingFolder(false)}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No hay archivos adjuntos</p>
              ) : (
                <ul className="space-y-2">
                  {/* Sin carpeta */}
                  {(filesByFolder["__root__"] ?? []).map((f) => renderFileRow(f))}
                  {/* Por carpeta */}
                  {rootFolders.map((folder) => {
                    const folderFiles = filesByFolder[folder.id] ?? [];
                    const isExpanded = expandedFolders.has(folder.id);
                    return (
                      <li key={folder.id} className="space-y-1">
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 cursor-pointer hover:bg-muted/30",
                            renamingFolderId === folder.id && "py-1"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedFolders((prev) => {
                                const next = new Set(prev);
                                if (next.has(folder.id)) next.delete(folder.id);
                                else next.add(folder.id);
                                return next;
                              })
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                          {renamingFolderId === folder.id ? (
                            <div className="flex items-center gap-1 flex-1">
                              <Input
                                className="h-7 text-xs flex-1"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameFolder(folder.id);
                                  if (e.key === "Escape") setRenamingFolderId(null);
                                }}
                                autoFocus
                              />
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleRenameFolder(folder.id)}>
                                OK
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm font-medium flex-1 truncate">{folder.name}</span>
                              {!readOnly && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={cn("h-7 w-7", folder.portalVisible && "text-emerald-600")}
                                    title={folder.portalVisible ? "Visible en portal (aplica a todos)" : "Oculta del portal"}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleFolderPortalVisible(folder);
                                    }}
                                  >
                                    {folder.portalVisible ? (
                                      <Eye className="h-3.5 w-3.5" />
                                    ) : (
                                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => { setRenamingFolderId(folder.id); setRenameValue(folder.name); }}>
                                        Renombrar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-destructive"
                                        onClick={() => {
                                          if (confirm(`¿Eliminar carpeta "${folder.name}"? Los archivos quedarán sin carpeta.`)) {
                                            handleDeleteFolder(folder.id);
                                          }
                                        }}
                                      >
                                        Eliminar
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        {isExpanded && (
                          <ul className="pl-6 space-y-2 mt-1">
                            {folderFiles.map((f) => renderFileRow(f))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {previewFile?.publicUrl && (
        <FilePreviewModal
          open={!!previewFile}
          onOpenChange={(open) => !open && setPreviewFile(null)}
          url={previewFile.publicUrl}
          fileName={previewFile.fileName}
          mimeType={previewFile.mimeType}
        />
      )}
    </>
  );
}
